import os
import shutil
import sys
import tempfile
from pathlib import Path
import pytest

# Ensure project root is in sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


@pytest.fixture(scope="session", autouse=True)
def isolated_test_environment():
    """
    Isolates test execution to temporary directories so zero live DB mutations occur on data/assistant.db.
    """
    temp_dir = Path(tempfile.mkdtemp(prefix="va_test_"))
    test_data_dir = temp_dir / "data"
    test_models_dir = test_data_dir / "models"
    test_db_path = test_data_dir / "test_assistant.db"

    test_models_dir.mkdir(parents=True, exist_ok=True)

    # Copy any existing small models into temp models dir so on-device tests work
    live_models_dir = PROJECT_ROOT / "backend" / "data" / "models"
    if live_models_dir.exists():
        for f in live_models_dir.glob("*.gguf"):
            try:
                shutil.copy2(f, test_models_dir / f.name)
            except Exception:
                pass

    os.environ["VA_DATA_DIR"] = str(test_data_dir)
    os.environ["VA_MODELS_DIR"] = str(test_models_dir)
    os.environ["VA_DB_PATH"] = str(test_db_path)
    os.environ["VA_SEARCH_ROOT"] = str(test_data_dir)

    import backend.app.config as cfg
    cfg.DATA_DIR = test_data_dir
    cfg.MODELS_DIR = test_models_dir
    cfg.DB_PATH = test_db_path
    cfg.SEARCH_ROOT = test_data_dir

    import backend.app.services.database as db
    db.DB_PATH = test_db_path
    db.init_db()

    import backend.app.services.model_service as ms
    ms.DATA_DIR = test_data_dir
    ms.MODELS_DIR = test_models_dir

    import backend.app.services.tool_service as ts
    ts.SEARCH_ROOT = test_data_dir

    yield {
        "temp_dir": temp_dir,
        "data_dir": test_data_dir,
        "models_dir": test_models_dir,
        "db_path": test_db_path,
    }

    try:
        shutil.rmtree(temp_dir, ignore_errors=True)
    except Exception:
        pass
