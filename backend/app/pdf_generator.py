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
    img = qr.make_image(fill_color="#064e3b", back_color="white")
    qr_io = io.BytesIO()
    img.save(qr_io, format="PNG")
    qr_io.seek(0)
    
    output = io.BytesIO()
    # Large top margin so the banner image fits without overlapping text
    doc = SimpleDocTemplate(output, pagesize=portrait(A4), topMargin=85*mm, bottomMargin=10*mm, leftMargin=10*mm, rightMargin=10*mm)
    elements = []
    
    # Paths are relative to the backend working directory
    base_dir = os.path.dirname(__file__)
    logo_path = os.path.join(base_dir, 'assets', 'clsl-logo.png')
    mascot_path = os.path.join(base_dir, 'assets', 'mascot_new.png')
    banner_path = os.path.join(base_dir, 'assets', 'banner_bg.jpg')
    
    def draw_bg(canvas, doc):
        canvas.saveState()
        try:
            width, height = A4
            # Draw banner at the top taking roughly 30% of the page
            banner_height = 80 * mm
            canvas.drawImage(banner_path, 0, height - banner_height, width=width, height=banner_height)
        except Exception:
            pass
        canvas.restoreState()
    
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle('Title', parent=styles['Heading1'], fontSize=34, spaceBefore=0, spaceAfter=2*mm, textColor=colors.HexColor("#064e3b"), alignment=1, fontName="Helvetica-Bold")
    desc_style = ParagraphStyle('Desc', parent=styles['Normal'], fontSize=20, spaceAfter=8*mm, textColor=colors.HexColor("#dc2626"), alignment=1, fontName="Helvetica-Bold")
    code_style = ParagraphStyle('Code', parent=styles['Heading1'], fontSize=36, spaceBefore=4*mm, spaceAfter=2*mm, textColor=colors.black, alignment=1, fontName="Helvetica-Bold", backColor=colors.HexColor("#fef08a"), borderPadding=8)
    dealer_style = ParagraphStyle('Dealer', parent=styles['Heading2'], fontSize=20, spaceAfter=8*mm, textColor=colors.HexColor("#334155"), alignment=1, fontName="Helvetica-Bold")
    
    # Logo
    try:
        elements.append(RLImage(logo_path, width=70*mm, height=21*mm, kind='proportional'))
    except:
        pass
        
    elements.append(Spacer(1, 2*mm))
    elements.append(Paragraph("FARMER REWARD NETWORK", title_style))
    elements.append(Paragraph("SCAN TO UNLOCK EXCLUSIVE DISCOUNTS!", desc_style))
    
    # QR Code
    elements.append(RLImage(qr_io, width=85*mm, height=85*mm))
    
    elements.append(Spacer(1, 2*mm))
    elements.append(Paragraph(f"REFERRAL CODE: {ref_token}", code_style))
    elements.append(Paragraph(f"{dealer_name}", dealer_style))
    
    # Instructions Headline
    how_to_style = ParagraphStyle('HowTo', fontSize=18, textColor=colors.HexColor("#064e3b"), alignment=1, fontName="Helvetica-Bold", spaceAfter=3*mm)
    elements.append(Paragraph("EASY 3-STEP PROCESS:", how_to_style))
    
    # 3 Steps Table
    step_num_style = ParagraphStyle('StepNum', fontSize=18, textColor=colors.white, alignment=1, fontName="Helvetica-Bold")
    step_title_style = ParagraphStyle('StepTitle', fontSize=14, spaceBefore=2*mm, spaceAfter=1*mm, textColor=colors.HexColor("#064e3b"), alignment=1, fontName="Helvetica-Bold")
    step_desc_style = ParagraphStyle('StepDesc', fontSize=12, leading=14, textColor=colors.HexColor("#1e293b"), alignment=1, fontName="Helvetica")
    
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
            Paragraph(f"<font color='white'> {num} </font>", ParagraphStyle(f'N{num}', parent=step_num_style, backColor=colors.HexColor("#10b981"), borderPadding=4, borderRadius=12)),
            Paragraph(title, step_title_style),
            Paragraph(desc, step_desc_style)
        ]
        
    t2 = Table([[step_col('1', step1_title, step1_desc), 
                 step_col('2', step2_title, step2_desc), 
                 step_col('3', step3_title, step3_desc)]], 
               colWidths=[48*mm, 48*mm, 48*mm])
    t2.setStyle(TableStyle([('VALIGN', (0,0), (-1,-1), 'TOP'), ('ALIGN', (0,0), (-1,-1), 'CENTER')]))
    
    try:
        mascot_img = RLImage(mascot_path, width=40*mm, height=50*mm, kind='proportional')
        layout_table = Table([[t2, mascot_img]], colWidths=[144*mm, 42*mm])
        layout_table.setStyle(TableStyle([('VALIGN', (0,0), (-1,-1), 'MIDDLE'), ('ALIGN', (0,0), (0,0), 'LEFT'), ('ALIGN', (1,0), (1,0), 'RIGHT')]))
        elements.append(layout_table)
    except:
        elements.append(t2)
        
    doc.build(elements, onFirstPage=draw_bg, onLaterPages=draw_bg)
    
    return output.getvalue()
