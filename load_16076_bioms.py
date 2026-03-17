#!/usr/bin/env python3
"""
load_16076_bioms.py

Directly inserts the 12 BIOM artifacts for study 16076 into the local Qiita
PostgreSQL database, bypassing the ORM's processing_parameters requirement.

Run from the qiita-web project root with the qiita conda env active:
    python load_16076_bioms.py

Prerequisites:
    - load_studies_safe.sh must have been run (study + prep + root BIOM loaded)
    - BIOM files must exist in test_data_studies/studies/16076/raw_data/BIOM/
"""

import os
import sys
import shutil
import zlib
from datetime import datetime

import qiita_db as qdb
from qiita_db.sql_connection import TRN

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BIOM_SRC = os.path.join(SCRIPT_DIR,
                        "test_data_studies/studies/16076/raw_data/BIOM")

QIITA_CFG_FP = os.environ.get(
    "QIITA_CONFIG_FP",
    os.path.expanduser("~/.qiita_config_test.cfg")
)
os.environ.setdefault("QIITA_CONFIG_FP", QIITA_CFG_FP)

# Re-import after env is set (config is read at import time)
from qiita_core.qiita_settings import qiita_config  # noqa: E402
BASE_DATA_DIR = qiita_config.base_data_dir

BIOM_MOUNTPOINT = "BIOM"   # matches qiita.data_directory.mountpoint
BIOM_DATA_DIR_ID = 16      # from SELECT * FROM qiita.data_directory
BIOM_ARTIFACT_TYPE_ID = 7  # BIOM
DATA_TYPE_ID = 1            # 16S
VISIBILITY_PUBLIC = 2
BIOM_FP_TYPE_ID = 7        # biom
LOG_FP_TYPE_ID = 13         # log
CHECKSUM_ALGO_ID = 1        # crc32

STUDY_TITLE = "Ground beef shelf-life prediction"

# Artifact hierarchy: (orig_id, biom_file, log_file, parent_orig_id)
# parent_orig_id=None means child of the root BIOM (artifact 12 equiv.)
BIOM_TREE = [
    # orig_id   biom_file             log_file                       parent_orig_id
    (221891, "all.biom",         None,                               None),
    (221893, "all.biom",         None,                               None),
    (221897, "otu_table.biom",   "log_20250808085113.txt",           None),
    (221899, "all.biom",         None,                               None),
    (221900, "otu_table.biom",   "log_20250808085113.txt",           None),
    (221901, "otu_table.biom",   "log_20250808085212.txt",           None),
    (221892, "reference-hit.biom", None,                            221891),
    (221894, "reference-hit.biom", None,                            221893),
    (221898, "reference-hit.biom", None,                            221897),
    (221895, "feature-table.biom", None,                            221892),
    (221896, "feature-table.biom", None,                            221894),
    (221902, "feature-table.biom", None,                            221900),
]


def crc32_of_file(path):
    """Compute CRC32 checksum of a file, returned as unsigned int string."""
    crc = 0
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            crc = zlib.crc32(chunk, crc)
    return str(crc & 0xFFFFFFFF)


def get_root_artifact_id(study_id):
    """Return the artifact_id that is the direct root of the study's prep."""
    with TRN:
        TRN.add("""
            SELECT sa.artifact_id
            FROM qiita.study_artifact sa
            JOIN qiita.artifact a ON sa.artifact_id = a.artifact_id
            LEFT JOIN qiita.parent_artifact pa ON pa.artifact_id = sa.artifact_id
            WHERE sa.study_id = %s AND pa.parent_id IS NULL
            ORDER BY sa.artifact_id
        """, [study_id])
        rows = TRN.execute_fetchindex()
        if not rows:
            raise RuntimeError("No root artifact found for study %d" % study_id)
        return rows[0][0]


def find_study_id(title):
    with TRN:
        TRN.add("SELECT study_id FROM qiita.study WHERE study_title = %s", [title])
        rows = TRN.execute_fetchindex()
        if not rows:
            raise RuntimeError("Study not found: %s" % title)
        return rows[0][0]


EXPECTED_ARTIFACT_COUNT = 13  # 1 root + 12 BIOMs


def artifact_count(study_id):
    with TRN:
        TRN.add("SELECT COUNT(*) FROM qiita.study_artifact WHERE study_id=%s",
                [study_id])
        return TRN.execute_fetchindex()[0][0]


def cleanup_partial_load(study_id, root_aid):
    """Delete all non-root artifacts for this study (fixes partial loads)."""
    with TRN:
        TRN.add("""SELECT artifact_id FROM qiita.study_artifact
                   WHERE study_id=%s AND artifact_id!=%s""",
                [study_id, root_aid])
        extra_aids = [r[0] for r in TRN.execute_fetchindex()]

    for aid in extra_aids:
        with TRN:
            TRN.add("SELECT filepath_id FROM qiita.artifact_filepath WHERE artifact_id=%s", [aid])
            fp_ids = [r[0] for r in TRN.execute_fetchindex()]

            # Find and delete processing jobs where this artifact is input or output
            TRN.add("""SELECT processing_job_id FROM qiita.artifact_processing_job
                       WHERE artifact_id=%s""", [aid])
            job_ids_in = [r[0] for r in TRN.execute_fetchindex()]
            TRN.add("""SELECT processing_job_id FROM qiita.artifact_output_processing_job
                       WHERE artifact_id=%s""", [aid])
            job_ids_out = [r[0] for r in TRN.execute_fetchindex()]
            all_job_ids = list(set(job_ids_in + job_ids_out))

            TRN.add("DELETE FROM qiita.artifact_processing_job WHERE artifact_id=%s", [aid])
            TRN.add("DELETE FROM qiita.artifact_output_processing_job WHERE artifact_id=%s", [aid])
            for jid in all_job_ids:
                TRN.add("DELETE FROM qiita.artifact_processing_job WHERE processing_job_id=%s", [jid])
                TRN.add("DELETE FROM qiita.artifact_output_processing_job WHERE processing_job_id=%s", [jid])
                TRN.add("DELETE FROM qiita.processing_job WHERE processing_job_id=%s", [jid])

            TRN.add("DELETE FROM qiita.parent_artifact WHERE artifact_id=%s OR parent_id=%s", [aid, aid])
            TRN.add("DELETE FROM qiita.artifact_filepath WHERE artifact_id=%s", [aid])
            TRN.add("DELETE FROM qiita.study_artifact WHERE artifact_id=%s", [aid])
            for fp_id in fp_ids:
                TRN.add("DELETE FROM qiita.filepath WHERE filepath_id=%s", [fp_id])
            TRN.add("DELETE FROM qiita.artifact WHERE artifact_id=%s", [aid])

        # Remove copied files
        artifact_dir = os.path.join(BASE_DATA_DIR, BIOM_MOUNTPOINT, str(aid))
        if os.path.isdir(artifact_dir):
            shutil.rmtree(artifact_dir)
        print("  Cleaned up partial artifact %d" % aid)


def insert_artifact(study_id, biom_path, log_path, parent_artifact_id):
    """
    Insert a BIOM artifact into the DB and copy files to BASE_DATA_DIR.
    Returns the new artifact_id.
    """
    now = datetime.now()

    with TRN:
        # 1. Insert the artifact row (command_id=NULL, command_parameters=NULL)
        TRN.add("""
            INSERT INTO qiita.artifact
                (generated_timestamp, visibility_id, artifact_type_id,
                 data_type_id, name)
            VALUES (%s, %s, %s, %s, 'noname')
            RETURNING artifact_id
        """, [now, VISIBILITY_PUBLIC, BIOM_ARTIFACT_TYPE_ID, DATA_TYPE_ID])
        artifact_id = TRN.execute_fetchindex()[0][0]

        # 2. Copy files into BASE_DATA_DIR/BIOM/{artifact_id}/
        dest_dir = os.path.join(BASE_DATA_DIR, BIOM_MOUNTPOINT,
                                str(artifact_id))
        os.makedirs(dest_dir, exist_ok=True)

        file_rows = [(biom_path, BIOM_FP_TYPE_ID)]
        if log_path and os.path.isfile(log_path):
            file_rows.append((log_path, LOG_FP_TYPE_ID))

        for src_path, fp_type_id in file_rows:
            fname = os.path.basename(src_path)
            dst_path = os.path.join(dest_dir, fname)
            shutil.copy2(src_path, dst_path)
            checksum = crc32_of_file(dst_path)
            fsize = os.path.getsize(dst_path)

            # 3. Insert into qiita.filepath
            TRN.add("""
                INSERT INTO qiita.filepath
                    (filepath, filepath_type_id, checksum,
                     checksum_algorithm_id, fp_size, data_directory_id)
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING filepath_id
            """, [fname, fp_type_id, checksum, CHECKSUM_ALGO_ID,
                  fsize, BIOM_DATA_DIR_ID])
            filepath_id = TRN.execute_fetchindex()[0][0]

            # 4. Link artifact → filepath
            TRN.add("""
                INSERT INTO qiita.artifact_filepath (artifact_id, filepath_id)
                VALUES (%s, %s)
            """, [artifact_id, filepath_id])

        # 5. Link artifact → study
        TRN.add("""
            INSERT INTO qiita.study_artifact (study_id, artifact_id)
            VALUES (%s, %s)
        """, [study_id, artifact_id])

        # 6. Link to parent (structural reference)
        TRN.add("""
            INSERT INTO qiita.parent_artifact (artifact_id, parent_id)
            VALUES (%s, %s)
        """, [artifact_id, parent_artifact_id])

        # 7. Create a dummy success processing job so the network graph renders.
        #    The graph renderer uses artifact_processing_job /
        #    artifact_output_processing_job, not parent_artifact.
        TRN.add("""
            INSERT INTO qiita.processing_job
                (email, command_id, command_parameters,
                 processing_job_status_id)
            VALUES (%s, %s, %s::jsonb, %s)
            RETURNING processing_job_id
        """, ['admin@foo.bar', 3, '{}', 3])
        job_id = TRN.execute_fetchindex()[0][0]

        # Input: parent artifact fed into the job
        TRN.add("""
            INSERT INTO qiita.artifact_processing_job
                (artifact_id, processing_job_id)
            VALUES (%s, %s)
        """, [parent_artifact_id, job_id])

        # Output: this artifact produced by the job
        TRN.add("""
            INSERT INTO qiita.artifact_output_processing_job
                (artifact_id, processing_job_id, command_output_id)
            VALUES (%s, %s, %s)
        """, [artifact_id, job_id, 3])

    return artifact_id


def main():
    print("=" * 60)
    print("load_16076_bioms.py — inserting BIOM artifacts for study 16076")
    print("=" * 60)

    study_id = find_study_id(STUDY_TITLE)
    print("study_id = %d" % study_id)

    root_aid = get_root_artifact_id(study_id)
    count = artifact_count(study_id)

    if count == EXPECTED_ARTIFACT_COUNT:
        print("BIOMs already fully loaded (%d artifacts). Exiting." % count)
        sys.exit(0)
    elif count > 1:
        print("Partial load detected (%d/%d artifacts). Cleaning up..."
              % (count, EXPECTED_ARTIFACT_COUNT))
        cleanup_partial_load(study_id, root_aid)
    print("root artifact_id = %d (will be parent of top-level BIOMs)" % root_aid)

    # Map orig_id → new local artifact_id as we insert
    orig_to_local = {None: root_aid}

    for orig_id, biom_fname, log_fname, parent_orig_id in BIOM_TREE:
        src_dir = os.path.join(BIOM_SRC, str(orig_id))
        biom_path = os.path.join(src_dir, biom_fname)
        log_path = os.path.join(src_dir, log_fname) if log_fname else None

        if not os.path.isfile(biom_path):
            print("  SKIP %d — file not found: %s" % (orig_id, biom_path))
            orig_to_local[orig_id] = None
            continue

        parent_local = orig_to_local.get(parent_orig_id)
        if parent_local is None and parent_orig_id is not None:
            print("  SKIP %d — parent %d was not loaded" % (orig_id, parent_orig_id))
            orig_to_local[orig_id] = None
            continue

        new_aid = insert_artifact(study_id, biom_path, log_path, parent_local)
        orig_to_local[orig_id] = new_aid
        print("  %d (%s) -> local artifact_id %d  [parent: %d]"
              % (orig_id, biom_fname, new_aid, parent_local))

    print()
    print("Done. Refresh your Qiita UI at https://localhost:21174/")


if __name__ == "__main__":
    main()
