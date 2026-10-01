from app.db import connection

with connection() as conn:
    print("FARMERS:")
    cols = conn.execute("SELECT column_name FROM information_schema.columns WHERE table_name='farmers'").fetchall()
    print([c['column_name'] for c in cols])
    
    print("DEALERS:")
    cols = conn.execute("SELECT column_name FROM information_schema.columns WHERE table_name='dealers'").fetchall()
    print([c['column_name'] for c in cols])
    
    print("USERS:")
    cols = conn.execute("SELECT column_name FROM information_schema.columns WHERE table_name='users'").fetchall()
    print([c['column_name'] for c in cols])
