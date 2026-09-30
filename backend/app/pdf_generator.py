import io
import os
from reportlab.lib.pagesizes import A4, portrait
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image as RLImage, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib import colors
import qrcode
from PIL import Image

def generate_referral_poster(dealer_name, ref_token, lang, is_sales_officer=False):
    base_url = "https://ai.croplifescience.com"
    link = f"{base_url}/farmer/join?ref={ref_token}"
    
    qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_H, box_size=15, border=1)
    qr.add_data(link)
    qr.make(fit=True)
    img = qr.make_image(fill_color="#064e3b", back_color="white")
    qr_io = io.BytesIO()
    img.save(qr_io, format="PNG")
    qr_io.seek(0)
    
    output = io.BytesIO()
    doc = SimpleDocTemplate(output, pagesize=portrait(A4), topMargin=90*mm, bottomMargin=15*mm, leftMargin=15*mm, rightMargin=15*mm)
    elements = []
    
    # Paths are relative to the backend working directory
    base_dir = os.path.dirname(__file__)
    logo_path = os.path.join(base_dir, 'assets', 'clsl-logo.png')
    mascot_path = os.path.join(base_dir, 'assets', 'mascot_new.png')
    bg_path = os.path.join(base_dir, 'assets', 'poster_bg.jpg')
    
    def draw_bg(canvas, doc):
        canvas.saveState()
        try:
            width, height = A4
            canvas.drawImage(bg_path, 0, 0, width=width, height=height)
        except Exception:
            pass
        canvas.restoreState()
    
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle('Title', parent=styles['Heading1'], fontSize=28, spaceBefore=2*mm, spaceAfter=2*mm, textColor=colors.HexColor("#064e3b"), alignment=1, fontName="Helvetica-Bold")
    subtitle_style = ParagraphStyle('Subtitle', parent=styles['Heading2'], fontSize=16, spaceAfter=5*mm, textColor=colors.HexColor("#0f766e"), alignment=1, fontName="Helvetica-Bold")
    desc_style = ParagraphStyle('Desc', parent=styles['Normal'], fontSize=14, spaceAfter=5*mm, textColor=colors.HexColor("#1e293b"), alignment=1, fontName="Helvetica")
    code_style = ParagraphStyle('Code', parent=styles['Heading1'], fontSize=28, spaceBefore=3*mm, spaceAfter=1*mm, textColor=colors.black, alignment=1, fontName="Helvetica-Bold")
    dealer_style = ParagraphStyle('Dealer', parent=styles['Heading2'], fontSize=16, spaceAfter=5*mm, textColor=colors.HexColor("#334155"), alignment=1, fontName="Helvetica-Bold")
    
    # Logo
    try:
        elements.append(RLImage(logo_path, width=60*mm, height=18*mm, kind='proportional'))
    except:
        pass
        
    elements.append(Paragraph("FARMER REWARD NETWORK", title_style))
    elements.append(Paragraph("Scan to Unlock Exclusive Discounts & Rewards", desc_style))
    
    # QR Code
    elements.append(RLImage(qr_io, width=80*mm, height=80*mm))
    
    elements.append(Spacer(1, 2*mm))
    elements.append(Paragraph(f"REFERRAL CODE: {ref_token}", code_style))
    elements.append(Paragraph(f"{dealer_name}", dealer_style))
    elements.append(Spacer(1, 3*mm))
    
    # 3 Steps Table
    step_num_style = ParagraphStyle('StepNum', fontSize=12, textColor=colors.white, alignment=1, fontName="Helvetica-Bold")
    step_title_style = ParagraphStyle('StepTitle', fontSize=11, spaceBefore=1*mm, textColor=colors.HexColor("#064e3b"), alignment=1, fontName="Helvetica-Bold")
    step_desc_style = ParagraphStyle('StepDesc', fontSize=9, leading=10, textColor=colors.HexColor("#1e293b"), alignment=1, fontName="Helvetica")
    
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
            Paragraph(f"<font color='white'>{num}</font>", ParagraphStyle(f'N{num}', parent=step_num_style, backColor=colors.HexColor("#10b981"), borderPadding=3, borderRadius=8)),
            Paragraph(title, step_title_style),
            Paragraph(desc, step_desc_style)
        ]
        
    t2 = Table([[step_col('1', step1_title, step1_desc), 
                 step_col('2', step2_title, step2_desc), 
                 step_col('3', step3_title, step3_desc)]], 
               colWidths=[40*mm, 40*mm, 40*mm])
    t2.setStyle(TableStyle([('VALIGN', (0,0), (-1,-1), 'TOP'), ('ALIGN', (0,0), (-1,-1), 'CENTER')]))
    
    try:
        mascot_img = RLImage(mascot_path, width=35*mm, height=45*mm, kind='proportional')
        layout_table = Table([[t2, mascot_img]], colWidths=[120*mm, 35*mm])
        layout_table.setStyle(TableStyle([('VALIGN', (0,0), (-1,-1), 'MIDDLE'), ('ALIGN', (0,0), (0,0), 'LEFT'), ('ALIGN', (1,0), (1,0), 'RIGHT')]))
        elements.append(layout_table)
    except:
        elements.append(t2)
        
    doc.build(elements, onFirstPage=draw_bg, onLaterPages=draw_bg)
    
    return output.getvalue()
