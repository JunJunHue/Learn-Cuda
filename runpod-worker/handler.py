"""
RunPod Serverless Worker — CUDA Sandbox
========================================
Deploy this as a RunPod serverless endpoint backed by a GPU instance (T4 or A10).

Requirements (Docker image must have):
  - NVIDIA CUDA Toolkit 12.x  (nvcc in PATH)
  - Python 3.10+
  - runpod Python package      (pip install runpod)

Dockerfile example:
  FROM nvidia/cuda:12.2.2-devel-ubuntu22.04
  RUN pip install runpod
  COPY handler.py .
  CMD ["python", "handler.py"]

Input schema:
  { "code": "<CUDA C++ source>", "timeout": 25 }

Output schema:
  { "exit_code": 0, "stdout": "...", "stderr": "..." }
"""

import runpod
import subprocess
import tempfile
import os
import shlex

MAX_CODE_BYTES  = 51_200   # 50 KB
MAX_OUTPUT_BYTES = 65_536  # 64 KB per stream
COMPILE_TIMEOUT  = 20      # seconds for nvcc
DEFAULT_TIMEOUT  = 25      # seconds for execution


def handler(job: dict) -> dict:
    job_input = job.get("input", {})
    code: str = job_input.get("code", "")
    timeout: int = min(int(job_input.get("timeout", DEFAULT_TIMEOUT)), DEFAULT_TIMEOUT)

    if not code or not isinstance(code, str):
        return {"exit_code": 1, "stdout": "", "stderr": "error: no code provided"}

    if len(code.encode()) > MAX_CODE_BYTES:
        return {"exit_code": 1, "stdout": "", "stderr": "error: code exceeds 50 KB limit"}

    with tempfile.TemporaryDirectory() as tmpdir:
        src_path = os.path.join(tmpdir, "main.cu")
        bin_path = os.path.join(tmpdir, "main")

        with open(src_path, "w") as f:
            f.write(code)

        # Compile with nvcc
        compile_result = subprocess.run(
            ["nvcc", "-O2", "-arch=sm_75", src_path, "-o", bin_path, "-lcuda", "-lm"],
            capture_output=True,
            text=True,
            timeout=COMPILE_TIMEOUT,
            cwd=tmpdir,
        )

        if compile_result.returncode != 0:
            return {
                "exit_code": compile_result.returncode,
                "stdout": "",
                "stderr": compile_result.stderr[:MAX_OUTPUT_BYTES],
            }

        # Execute with resource limits
        try:
            run_result = subprocess.run(
                [bin_path],
                capture_output=True,
                text=True,
                timeout=timeout,
                cwd=tmpdir,
                # Prevent writing to disk outside tmpdir
                env={**os.environ, "TMPDIR": tmpdir},
            )
            return {
                "exit_code": run_result.returncode,
                "stdout": run_result.stdout[:MAX_OUTPUT_BYTES],
                "stderr": (compile_result.stderr + run_result.stderr)[:MAX_OUTPUT_BYTES],
            }
        except subprocess.TimeoutExpired:
            return {
                "exit_code": 124,
                "stdout": "",
                "stderr": f"error: execution timed out after {timeout}s",
            }


runpod.serverless.start({"handler": handler})
