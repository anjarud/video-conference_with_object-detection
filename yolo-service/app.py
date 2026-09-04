import base64
import os
import shutil
import json
from pathlib import Path
from fastapi import FastAPI, Request, File, UploadFile
from fastapi.responses import JSONResponse
from fastapi.templating import Jinja2Templates
from ultralytics import YOLO

# Define the templates directory for Jinja2Templates
templates = Jinja2Templates(directory="templates")

# Create a FastAPI app
app = FastAPI()

# Specify the folder where uploaded files will be stored
uploads_folder = Path("uploads")

# GET router for the index page
@app.get("/")
async def read_root(request: Request):
    """
    Handles GET requests to the root URL.
    Renders the index.html template.
    """
    return templates.TemplateResponse("index.html", {"request": request})

# POST router for object detection
@app.post("/detect/{label}")
@app.post("/detect/")
async def detect_objects(request: Request, image: UploadFile = File(...), label: str = None):
    """
    Handles POST requests to /detect/ endpoint for object detection.

    Parameters:
        - request: HTTP request object
        - image: Uploaded image file (required)
        - label: Optional label parameter for filtering detected objects

    Returns:
        JSONResponse containing detection results
    """
    # Get form data
    form_data = await request.form()
    label_value = form_data.get("label")

    # Check if an image is uploaded
    if not image:
        return JSONResponse(status_code=400, content={"error": "No image uploaded"})

    # Create the folder to upload the image
    target_folder = uploads_folder
    target_folder.mkdir(parents=True, exist_ok=True)

    # Copy the image file
    file_path = target_folder / image.filename
    with file_path.open("wb") as buffer:
        shutil.copyfileobj(image.file, buffer)

    # Create ONNX model if not exist
    onnx_model_path = 'yolov8n.onnx'
    if not os.path.exists(onnx_model_path):
        model = YOLO('yolov8n.pt')  
        model.export(format='onnx')  

    # Load the YOLO model
    onnx_model = YOLO(onnx_model_path, task='detect')
    source = str(file_path)

    # Perform object detection
    result = onnx_model(source, save=True)

    # Process object detection results
    output = []
    for r in result:
        for box, value, prob in zip(r.boxes.xywh, r.boxes.cls, r.boxes.conf):
            detected_label = r.names[value.item()]
            x, y, w, h = box
            confidence = round(prob.item(), 2)
            entry = {
                "label": detected_label,
                "x": int(x),
                "y": int(y),
                "width": int(w),
                "height": int(h),
                "confidence": confidence
            }
            output.append(entry)

    # If label parameter is given, perform filtering
   
    if label_value != None and label_value != "" :
        filtered_output = [obj for obj in output if obj['label'] == label_value]
        output = filtered_output
     


    # app.py path 
    current_dir = os.path.dirname(os.path.abspath(__file__))

    # uploads path
    uploads_dir = os.path.join(current_dir, "uploads")

    # path the image
    image_path = os.path.join(uploads_dir, image.filename)
    

    # Encode the image file to Base64
    with open(image_path, "rb") as image_file:
        encoded_image = base64.b64encode(image_file.read()).decode('utf-8')



    # Return the results # just return
    return {
        "image": encoded_image,
        "objects": output,
        "count": len(output)
    }


