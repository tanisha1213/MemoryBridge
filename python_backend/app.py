import os
import base64
import cv2
import numpy as np
from flask import Flask, request, jsonify
from flask_cors import CORS

try:
    from mtcnn import MTCNN
    from deepface import DeepFace
    from pymongo import MongoClient
    from scipy.spatial.distance import cosine
    DEEPFACE_AVAILABLE = True
except ImportError as e:
    DEEPFACE_AVAILABLE = False
    print(f"⚠️ Warning: DeepFace or dependencies not installed ({e}). Running in fallback mode.")

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

if DEEPFACE_AVAILABLE:
    try:
        client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=4000)
        db = client['memorybridge']
        visitors_col = db['visitors']
        unknown_queue_col = db['unknown_queues']
        detector = MTCNN()
    except Exception as e:
        print(f"⚠️ MongoDB Connection Exception: {e}")

def base64_to_cv2(b64_string):
    encoded_data = b64_string.split(',')[1] if ',' in b64_string else b64_string
    nparr = np.frombuffer(base64.b64decode(encoded_data), np.uint8)
    return cv2.imdecode(nparr, cv2.IMREAD_COLOR)

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({
        'status': 'ok',
        'service': 'MemoryBridge Python DeepFace Facenet512 Backend',
        'deepface_available': DEEPFACE_AVAILABLE,
        'db_connected': visitors_col is not None
    })

# ----------------- 1. REGISTER NEW VISITOR -----------------
@app.route('/api/visitors/register', methods=['POST'])
def register_visitor():
    if not DEEPFACE_AVAILABLE or visitors_col is None:
        return jsonify({'error': 'DeepFace backend or MongoDB is not available'}), 503

    try:
        data = request.json or {}
        family_code = data.get('familyCode')
        name = data.get('name')
        relationship = data.get('relationship', 'Visitor')
        context_note = data.get('contextNote', '')
        image_b64 = data.get('image') or data.get('photoThumbnail')

        if not family_code or not name or not image_b64:
            return jsonify({'error': 'Missing required fields (familyCode, name, image)'}), 400

        img = base64_to_cv2(image_b64)
        rgb_img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

        faces = detector.detect_faces(rgb_img)
        if not faces:
            return jsonify({'error': 'No face detected in image'}), 400

        x, y, w, h = faces[0]['box']
        x, y = max(0, x), max(0, y)
        face_img = rgb_img[y:y+h, x:x+w]

        # Extract 512-D Facenet512 Embedding
        embedding_objs = DeepFace.represent(
            face_img, 
            model_name='Facenet512', 
            detector_backend='skip',
            enforce_detection=False
        )
        embedding = embedding_objs[0]['embedding']

        visitor_doc = {
            'familyCode': family_code,
            'name': name,
            'relationship': relationship,
            'contextNote': context_note,
            'embedding': embedding,
            'photoThumbnail': image_b64,
            'isRegistered': True
        }

        result = visitors_col.insert_one(visitor_doc)

        # Delete from unknown queue if registering from snapshot
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


# ----------------- 2. RECOGNIZE VISITOR -----------------
@app.route('/api/visitors/recognize', methods=['POST'])
def recognize_visitor():
    if not DEEPFACE_AVAILABLE or visitors_col is None:
        return jsonify({'status': 'ERROR', 'message': 'DeepFace backend or MongoDB is not available'}), 503

    try:
        data = request.json or {}
        family_code = data.get('familyCode')
        image_b64 = data.get('image') or data.get('photoThumbnail')

        if not family_code or not image_b64:
            return jsonify({'status': 'ERROR', 'message': 'Missing parameters (familyCode, image)'}), 400

        img = base64_to_cv2(image_b64)
        rgb_img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

        faces = detector.detect_faces(rgb_img)
        if not faces:
            return jsonify({'status': 'NO_FACE'})

        x, y, w, h = faces[0]['box']
        x, y = max(0, x), max(0, y)
        face_img = rgb_img[y:y+h, x:x+w]

        # Extract 512-D Embedding
        embedding_objs = DeepFace.represent(
            face_img, 
            model_name='Facenet512', 
            detector_backend='skip',
            enforce_detection=False
        )
        live_embedding = embedding_objs[0]['embedding']

        # Fetch visitors STRICTLY for this familyCode
        registered_visitors = list(visitors_col.find({'familyCode': family_code, 'isRegistered': True}))

        best_match = None
        min_distance = 1.0

        for visitor in registered_visitors:
            stored_embedding = visitor.get('embedding')
            if stored_embedding:
                dist = cosine(live_embedding, stored_embedding)
                if dist < min_distance:
                    min_distance = dist
                    best_match = visitor

        # Strict Facenet512 Cosine Distance Threshold: 0.35 (Lower = stricter precision)
        if best_match and min_distance < 0.35:
            return jsonify({
                'status': 'RECOGNIZED',
                'distance': float(min_distance),
                'visitor': {
                    'id': str(best_match['_id']),
                    'name': best_match.get('name', 'Visitor'),
                    'relationship': best_match.get('relationship', 'Visitor'),
                    'contextNote': best_match.get('contextNote', '')
                }
            })
        else:
            return jsonify({
                'status': 'UNKNOWN',
                'distance': float(min_distance)
            })

    except Exception as e:
        print("Recognition Error:", str(e))
        return jsonify({'status': 'ERROR', 'message': str(e)}), 500

if __name__ == '__main__':
    port = int(os.getenv("PORT", 5001))
    print(f"🚀 MemoryBridge DeepFace Service starting on port {port}...")
    app.run(host='0.0.0.0', port=port, debug=True)
