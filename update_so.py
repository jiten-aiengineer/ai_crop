with open('backend/app/sales_officer_routes.py', 'r') as f:
    content = f.read()

start_marker = 'link = f"https://ai.croplifescience.com/farmer/join?ref={ref_token}"'
end_marker = '        })'

start_idx = content.find(start_marker)
end_idx = content.find(end_marker, start_idx) + len(end_marker)

if start_idx != -1 and end_idx != -1:
    replacement = '''        from .pdf_generator import generate_referral_poster
        pdf = generate_referral_poster(f"Sales Officer: {emp['full_name']}", ref_token, lang, is_sales_officer=True)
        
        return Response(content=pdf, media_type="application/pdf", headers={
            "Content-Disposition": f\\'attachment; filename="CLSL-SO-{emp["employee_code"]}-Poster.pdf"\\'
        })'''
    new_content = content[:start_idx] + replacement + content[end_idx:]
    with open('backend/app/sales_officer_routes.py', 'w') as f:
        f.write(new_content)
    print('Updated successfully')
else:
    print('Failed to find markers')
