with open("backend/app/sales_officer_routes.py", "r") as f:
    c = f.read()
c = c.replace("f\\'attachment", "f'attachment")
with open("backend/app/sales_officer_routes.py", "w") as f:
    f.write(c)
