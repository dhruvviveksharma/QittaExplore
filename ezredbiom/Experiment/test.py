# import os
# os.environ['QIITA_CONFIG_FP'] = '/home/d4sharma/qiita-web/qiita_config.cfg'  # set this first

from qiita_db.sql_connection import TRN
with TRN:
    TRN.add("SELECT * FROM qiita.study LIMIT 5")
    results = TRN.execute_fetchindex()

for row in results:
    print(row)