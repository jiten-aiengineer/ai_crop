import io
import os
from reportlab.lib.pagesizes import A4, portrait
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image as RLImage, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib import colors
import qrcode

def generate_referral_poster(dealer_name, ref_token, lang, is_sales_officer=False):
    base_url = "https://ai.croplifescience.com"
    link = f"{base_url}/farmer/join?ref={ref_token}"
    
    qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_H, box_size=15, border=1)
    qr.add_data(link)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    qr_io = io.BytesIO()
    img.save(qr_io, format="PNG")
    qr_io.seek(0)
    
    output = io.BytesIO()
    doc = SimpleDocTemplate(output, pagesize=portrait(A4), topMargin=15*mm, bottomMargin=10*mm, leftMargin=15*mm, rightMargin=15*mm)
    elements = []
    
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        'Title', parent=styles['Heading1'], fontSize=32, spaceBefore=5*mm, spaceAfter=2*mm, textColor=colors.HexColor("#11401b"), alignment=1, fontName="Helvetica-Bold"
    )
    dealer_style = ParagraphStyle(
        'Dealer', parent=styles['Heading2'], fontSize=18, spaceAfter=2*mm, textColor=colors.HexColor("#555555"), alignment=1, fontName="Helvetica-Bold"
    )
    subtitle_style = ParagraphStyle(
        'Subtitle', parent=styles['Heading2'], fontSize=20, spaceAfter=2*mm, textColor=colors.black, alignment=1, fontName="Helvetica-Bold"
    )
    desc_style = ParagraphStyle(
        'Desc', parent=styles['Normal'], fontSize=16, spaceAfter=8*mm, textColor=colors.HexColor("#333333"), alignment=1, fontName="Helvetica"
    )
    code_style = ParagraphStyle(
        'Code', parent=styles['Heading1'], fontSize=28, spaceBefore=3*mm, spaceAfter=3*mm, textColor=colors.black, alignment=1, fontName="Helvetica-Bold"
    )
    
    # Paths are relative to the backend working directory
    base_dir = os.path.dirname(__file__)
    logo_path = os.path.join(base_dir, 'assets', 'clsl-logo.png')
    mascot_path = os.path.join(base_dir, 'assets', 'mascot_new.png')
    
    # Logo
    try:
        elements.append(RLImage(logo_path, width=70*mm, height=22*mm, kind='proportional'))
    except:
        pass
        
    elements.append(Paragraph("Farmer Reward Network", title_style))
    
    elements.append(Paragraph("REFERRAL PROGRAM", subtitle_style))
    elements.append(Paragraph("Scan to Unlock Exclusive Discounts & Rewards", desc_style))
    
    # QR Code
    elements.append(RLImage(qr_io, width=105*mm, height=105*mm))
    
    elements.append(Spacer(1, 3*mm))
    elements.append(Paragraph(f"REFERRAL CODE: {ref_token}", code_style))
    elements.append(Paragraph(f"{dealer_name}", dealer_style))
    elements.append(Spacer(1, 8*mm))
    
    # 3 Steps Table
    step_num_style = ParagraphStyle('StepNum', fontSize=14, textColor=colors.white, alignment=1, fontName="Helvetica-Bold")
    step_title_style = ParagraphStyle('StepTitle', fontSize=12, spaceBefore=2*mm, textColor=colors.HexColor("#11401b"), alignment=1, fontName="Helvetica-Bold")
    step_desc_style = ParagraphStyle('StepDesc', fontSize=10, leading=12, textColor=colors.black, alignment=1, fontName="Helvetica")
    
    step1_title = 'DOWNLOAD APP'
    step1_desc = 'Play Store or App Store'
    step2_title = 'REGISTER'
    step2_desc = f'Use Code {ref_token}'
    step3_title = 'SCAN & EARN'
    step3_desc = 'Exclusive Discounts!'

    if lang == 'hi':
        step1_title = 'APP DOWNLOAD'
        step1_desc = 'Play Store se karein'
        step2_title = 'REGISTER'
        step2_desc = f'Code {ref_token} daalein'
        step3_title = 'SCAN KAREIN'
        step3_desc = 'Discounts paayein!'
    elif lang == 'gu':
        step1_title = 'APP DOWNLOAD'
        step1_desc = 'Play Store thi karo'
        step2_title = 'REGISTER'
        step2_desc = f'Code {ref_token} vapro'
        step3_title = 'SCAN KARO'
        step3_desc = 'Discounts medvo!'
    elif lang == 'mr':
        step1_title = 'APP DOWNLOAD'
        step1_desc = 'Play Store varun kara'
        step2_title = 'REGISTER'
        step2_desc = f'Code {ref_token} vapara'
        step3_title = 'SCAN KARA'
        step3_desc = 'Discounts milva!'
    elif lang == 'pa':
        step1_title = 'APP DOWNLOAD'
        step1_desc = 'Play Store ton karo'
        step2_title = 'REGISTER'
        step2_desc = f'Code {ref_token} varto'
        step3_title = 'SCAN KARO'
        step3_desc = 'Discounts pao!'
        
    def step_col(num, title, desc):
        return [
            Paragraph(f"<font color='white'>{num}</font>", ParagraphStyle(f'N{num}', parent=step_num_style, backColor=colors.HexColor("#7cb044"), borderPadding=4, borderRadius=10)),
            Paragraph(title, step_title_style),
            Paragraph(desc, step_desc_style)
        ]
        
    t = Table([[step_col('1', step1_title, step1_desc), 
                step_col('2', step2_title, step2_desc), 
                step_col('3', step3_title, step3_desc)]], 
              colWidths=[60*mm, 60*mm, 60*mm])
    t.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
    ]))
    
    # We will put the table and the mascot side-by-side or overlapping
    # Let's use a two-column table for the bottom: Left is the 3 steps, Right is the mascot.
    # Actually 3 steps takes up 180mm out of 210mm. That's too wide if mascot is there.
    # Let's make steps smaller: 3 columns of 45mm = 135mm. Then mascot takes 45mm.
    t2 = Table([[step_col('1', step1_title, step1_desc), 
                 step_col('2', step2_title, step2_desc), 
                 step_col('3', step3_title, step3_desc)]], 
               colWidths=[45*mm, 45*mm, 45*mm])
    t2.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
    ]))
    
    bottom_elements = []
    try:
        mascot_img = RLImage(mascot_path, width=40*mm, height=50*mm, kind='proportional')
        
        layout_table = Table([[t2, mascot_img]], colWidths=[135*mm, 45*mm])
        layout_table.setStyle(TableStyle([
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
            ('ALIGN', (0,0), (0,0), 'LEFT'),
            ('ALIGN', (1,0), (1,0), 'RIGHT'),
        ]))
        bottom_elements.append(layout_table)
    except:
        bottom_elements.append(t2)
        
    elements.extend(bottom_elements)
    
    doc.build(elements)
    
    return output.getvalue()
