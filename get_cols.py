import psycopg
db='postgresql://crop_life:crop-life-local-only@127.0.0.1:5434/crop_life_ai'
c = psycopg.connect(db)
print([c.name for c in c.execute('SELECT * FROM employees LIMIT 0').description])
