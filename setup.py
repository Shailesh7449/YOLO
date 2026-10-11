from setuptools import setup, find_packages

setup(
    name="visionsense",
    version="1.0.0",
    description="VisionSense AI Security Operations Center - Python Computer Vision & Evidence Engine",
    author="VisionSense",
    packages=find_packages(),
    python_requires=">=3.10",
    install_requires=[
        "ultralytics>=8.3.0",
        "opencv-python-headless>=4.8.0",
        "numpy>=1.24.0",
        "psutil>=5.9.0",
    ],
    entry_points={
        "console_scripts": [
            "visionsense=main:main",
        ],
    },
)
