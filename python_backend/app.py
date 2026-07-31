import os
import sys
import base64
import cv2
import numpy as np
from flask import Flask, request, jsonify
from flask_cors import CORS
from datetime import datetime

# Set UTF-8 encoding for Windows console compatibility
if sys.platform.startswith('win'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

# 1. IMPORT FACE_RECOGNITION / DLIB WITH FALLBACK
FACE_REC_AVAILABLE = False
try:
    import face_recognition
    FACE_REC_AVAILABLE = True
    print("[SUCCESS] dlib face_recognition ResNet engine loaded successfully!")
except ImportError as e:
    print(f"[NOTICE] face_recognition (dlib) module not installed ({e}).")

try:
    from pymongo import MongoClient
    MONGO_AVAILABLE = True
except ImportError:
    MONGO_AVAILABLE = False

app = Flask(__name__)
CORS(app)  # Enable CORS for Express/React client calls

MONGODB_URI = os.getenv(
    "MONGODB_URI", 
    "mongodb+srv://StackNovas:E1w8oBHfD71MzbEG@cluster0.c4jlm5g.mongodb.net/memorybridge?retryWrites=true&w=majority"
)

db = None
visitors_col = None
unknown_queue_col = None

if MONGO_AVAILABLE:
    try:
        client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=4000)
        db = client['memorybridge']
        visitors_col = db['visitors']
        unknown_queue_col = db['unknown_queues']
        print("[SUCCESS] MongoDB Atlas connected in Python microservice.")
    except Exception as e:
        print(f"[WARNING] MongoDB Connection Exception: {e}")

def base64_to_rgb_image(b64_string):
    encoded_data = b64_string.split(',')[1] if ',' in b64_string else b64_string
    nparr = np.frombuffer(base64.b64decode(encoded_data), np.uint8)
    bgr_img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    return cv2.cvtColor(bgr_img, cv2.COLOR_BGR2RGB)

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({
        'status': 'ok',
        'engine': 'dlib ResNet',
        'face_rec_available': FACE_REC_AVAILABLE,
        'db_connected': visitors_col is not None
    })

# ----------------- RECOGNIZE & SNAPSHOT API -----------------
@app.route('/api/visitors/recognize', methods=['POST'])
def recognize_visitor():
    try:
        data = request.json or {}
        family_code = data.get('familyCode', 'MB-1001')
        image_b64 = data.get('image') or data.get('photoThumbnail')
        save_snapshot = data.get('saveSnapshot', False)

        if not family_code or not image_b64:
            return jsonify({'status': 'ERROR', 'message': 'Missing parameters'}), 400

        rgb_img = base64_to_rgb_image(image_b64)
        unknown_encodings = face_recognition.face_encodings(rgb_img)

        if not unknown_encodings:
            return jsonify({'status': 'NO_FACE'})

        unknown_encoding = unknown_encodings[0]
        registered_visitors = list(visitors_col.find({'familyCode': family_code, 'isRegistered': True})) if visitors_col is not None else []

        known_encodings = [np.array(v['encoding']) for v in registered_visitors if 'encoding' in v]

        if not known_encodings:
            if save_snapshot and unknown_queue_col is not None:
                unknown_queue_col.insert_one({
                    'familyCode': family_code,
                    'name': 'Unrecognized Person',
                    'relationship': 'Unknown',
                    'contextNote': 'Captured by camera',
                    'photoThumbnail': image_b64,
                    'encoding': unknown_encoding.tolist(),
                    'isRegistered': False,
                    'status': 'PENDING_REVIEW',
                    'createdAt': datetime.utcnow()
                })
            return jsonify({'status': 'UNKNOWN', 'snapshotSaved': save_snapshot})

        matches = face_recognition.compare_faces(known_encodings, unknown_encoding, tolerance=0.50)
        face_distances = face_recognition.face_distance(known_encodings, unknown_encoding)
        best_match_index = int(np.argmin(face_distances))

        if matches[best_match_index]:
            matched_visitor = registered_visitors[best_match_index]
            return jsonify({
                'status': 'RECOGNIZED',
                'distance': float(face_distances[best_match_index]),
                'visitor': {
                    'id': str(matched_visitor['_id']),
                    'name': matched_visitor.get('name', 'Visitor'),
                    'relationship': matched_visitor.get('relationship', 'Visitor'),
                    'contextNote': matched_visitor.get('contextNote', '')
                }
            })
        else:
            snapshot_id = None
            if save_snapshot and unknown_queue_col is not None:
                res_unknown = unknown_queue_col.insert_one({
                    'familyCode': family_code,
                    'name': 'Unrecognized Person',
                    'relationship': 'Unknown',
                    'contextNote': 'Captured by camera',
                    'photoThumbnail': image_b64,
                    'encoding': unknown_encoding.tolist(),
                    'isRegistered': False,
                    'status': 'PENDING_REVIEW',
                    'createdAt': datetime.utcnow()
                })
                snapshot_id = str(res_unknown.inserted_id)

            return jsonify({
                'status': 'UNKNOWN',
                'distance': float(face_distances[best_match_index]),
                'snapshotSaved': save_snapshot,
                'snapshotId': snapshot_id
            })

    except Exception as e:
        return jsonify({'status': 'ERROR', 'message': str(e)}), 500

if __name__ == '__main__':
    port = int(os.getenv("PORT", 5001))
    print(f"[STARTING] MemoryBridge Python dlib ResNet Service starting on port {port}...")
    app.run(host='0.0.0.0', port=port, debug=True)
