import os
import base64
import cv2
import numpy as np
from flask import Flask, request, jsonify
from flask_cors import CORS
from datetime import datetime

# 1. IMPORT FACE_RECOGNITION / DLIB WITH FALLBACK
FACE_REC_AVAILABLE = False
try:
    import face_recognition
    FACE_REC_AVAILABLE = True
    print("✅ dlib face_recognition engine loaded successfully!")
except ImportError as e:
    print(f"⚠️ Notice: face_recognition (dlib) module not installed ({e}). Running in fallback mode.")

try:
    from pymongo import MongoClient
    MONGO_AVAILABLE = True
except ImportError:
    MONGO_AVAILABLE = False
    print("⚠️ Notice: pymongo module not installed.")

app = Flask(__name__)
CORS(app)  # Enable CORS for Express/React client calls

# ----------------- MongoDB Setup -----------------
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
        print("✅ MongoDB Atlas connected in Python microservice.")
    except Exception as e:
        print(f"⚠️ MongoDB Connection Exception: {e}")

def base64_to_rgb_image(b64_string):
    encoded_data = b64_string.split(',')[1] if ',' in b64_string else b64_string
    nparr = np.frombuffer(base64.b64decode(encoded_data), np.uint8)
    bgr_img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    return cv2.cvtColor(bgr_img, cv2.COLOR_BGR2RGB)

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({
        'status': 'ok',
        'service': 'MemoryBridge Python dlib ResNet Face Recognition Backend',
        'face_rec_available': FACE_REC_AVAILABLE,
        'db_connected': visitors_col is not None
    })

# ----------------- 1. REGISTER NEW VISITOR -----------------
@app.route('/api/visitors/register', methods=['POST'])
def register_visitor():
    if not FACE_REC_AVAILABLE or visitors_col is None:
        return jsonify({'error': 'face_recognition module or MongoDB is not available'}), 503

    try:
        data = request.json or {}
        family_code = data.get('familyCode', 'MB-1001')
        name = data.get('name')
        relationship = data.get('relationship', 'Visitor')
        context_note = data.get('contextNote', '')
        image_b64 = data.get('image') or data.get('photoThumbnail')

        if not family_code or not name or not image_b64:
            return jsonify({'error': 'Missing required parameters'}), 400

        rgb_img = base64_to_rgb_image(image_b64)

        # Generate 128-D encoding using dlib ResNet
        encodings = face_recognition.face_encodings(rgb_img)
        if not encodings:
            return jsonify({'error': 'No face found in image'}), 400

        encoding_list = encodings[0].tolist()

        visitor_doc = {
            'familyCode': family_code,
            'name': name,
            'relationship': relationship,
            'contextNote': context_note,
            'encoding': encoding_list,
            'faceDescriptor': encoding_list,
            'photoThumbnail': image_b64,
            'isRegistered': True,
            'createdAt': datetime.utcnow()
        }

        result = visitors_col.insert_one(visitor_doc)

        if data.get('unknownId'):
            try:
                from bson import ObjectId
                unknown_queue_col.delete_one({'_id': ObjectId(data.get('unknownId'))})
            except Exception:
                pass

        return jsonify({'success': True, 'visitorId': str(result.inserted_id)}), 200

    except Exception as e:
        print("Registration Error:", str(e))
        return jsonify({'error': str(e)}), 500


# ----------------- 2. RECOGNIZE & SNAPSHOT API -----------------
@app.route('/api/visitors/recognize', methods=['POST'])
def recognize_visitor():
    if not FACE_REC_AVAILABLE or visitors_col is None:
        return jsonify({'status': 'ERROR', 'message': 'face_recognition module or MongoDB is not available'}), 503

    try:
        data = request.json or {}
        family_code = data.get('familyCode', 'MB-1001')
        image_b64 = data.get('image') or data.get('photoThumbnail')
        save_snapshot = data.get('saveSnapshot', False)

        if not family_code or not image_b64:
            return jsonify({'status': 'ERROR', 'message': 'Missing parameters'}), 400

        rgb_img = base64_to_rgb_image(image_b64)

        # 1. Find face encodings in current camera frame
        unknown_encodings = face_recognition.face_encodings(rgb_img)

        if not unknown_encodings:
            return jsonify({'status': 'NO_FACE'})

        unknown_encoding = unknown_encodings[0]

        # 2. Fetch registered family visitors from MongoDB
        registered_visitors = list(visitors_col.find({'familyCode': family_code, 'isRegistered': True}))

        if not registered_visitors:
            if save_snapshot and unknown_queue_col is not None:
                unknown_doc = {
                    'familyCode': family_code,
                    'name': 'Unrecognized Person',
                    'relationship': 'Unknown',
                    'contextNote': 'Captured by camera',
                    'photoThumbnail': image_b64,
                    'encoding': unknown_encoding.tolist(),
                    'isRegistered': False,
                    'status': 'PENDING_REVIEW',
                    'createdAt': datetime.utcnow()
                }
                unknown_queue_col.insert_one(unknown_doc)
            return jsonify({'status': 'UNKNOWN', 'snapshotSaved': save_snapshot})

        # Build list of known encodings & visitor objects
        known_encodings = []
        valid_visitors = []
        for v in registered_visitors:
            enc = v.get('encoding') or v.get('faceDescriptor')
            if enc and len(enc) == 128:
                known_encodings.append(np.array(enc))
                valid_visitors.append(v)

        if not known_encodings:
            if save_snapshot and unknown_queue_col is not None:
                unknown_doc = {
                    'familyCode': family_code,
                    'photoThumbnail': image_b64,
                    'encoding': unknown_encoding.tolist(),
                    'isRegistered': False,
                    'createdAt': datetime.utcnow()
                }
                unknown_queue_col.insert_one(unknown_doc)
            return jsonify({'status': 'UNKNOWN', 'snapshotSaved': save_snapshot})

        # 3. Compare faces using dlib with strict tolerance (0.50 for 99.38% precision)
        matches = face_recognition.compare_faces(known_encodings, unknown_encoding, tolerance=0.50)
        face_distances = face_recognition.face_distance(known_encodings, unknown_encoding)

        best_match_index = int(np.argmin(face_distances))

        if matches[best_match_index]:
            matched_visitor = valid_visitors[best_match_index]
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
            # 🔴 UNKNOWN PERSON -> SAVE SNAPSHOT TO MONGODB
            snapshot_id = None
            if save_snapshot and unknown_queue_col is not None:
                unknown_doc = {
                    'familyCode': family_code,
                    'name': 'Unrecognized Person',
                    'relationship': 'Unknown',
                    'contextNote': 'Captured by camera',
                    'photoThumbnail': image_b64,
                    'encoding': unknown_encoding.tolist(),
                    'isRegistered': False,
                    'status': 'PENDING_REVIEW',
                    'createdAt': datetime.utcnow()
                }
                res_unknown = unknown_queue_col.insert_one(unknown_doc)
                if visitors_col is not None:
                    visitors_col.insert_one(unknown_doc)
                snapshot_id = str(res_unknown.inserted_id)
                print("📸 Saved unknown snapshot to MongoDB via face_recognition!")

            return jsonify({
                'status': 'UNKNOWN',
                'distance': float(face_distances[best_match_index]),
                'snapshotSaved': save_snapshot,
                'snapshotId': snapshot_id
            })

    except Exception as e:
        print("Registration/Recognition Error:", str(e))
        return jsonify({'status': 'ERROR', 'message': str(e)}), 500

if __name__ == '__main__':
    port = int(os.getenv("PORT", 5001))
    print(f"🚀 MemoryBridge dlib ResNet Service starting on port {port}...")
    app.run(host='0.0.0.0', port=port, debug=True)
