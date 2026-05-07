SELECT
    a.artifact_id,
    '/Users/dhruvsharma/Downloads/qiita/qiita_db/support_files/test_data'
        || '/' || dd.mountpoint
        || '/' || a.artifact_id
        || '/' || f.filepath  AS full_path
FROM qiita.artifact a
JOIN qiita.artifact_type       at  ON a.artifact_type_id = at.artifact_type_id
JOIN qiita.artifact_filepath   af  ON a.artifact_id = af.artifact_id
JOIN qiita.filepath            f   ON af.filepath_id = f.filepath_id
JOIN qiita.data_directory      dd  ON f.data_directory_id = dd.data_directory_id
WHERE at.artifact_type = 'BIOM'
ORDER BY a.artifact_id;
