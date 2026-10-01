import io
import os
from reportlab.lib.pagesizes import A4, portrait
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image as RLImage, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.pdfgen import canvas
import qrcode
from PIL import Image

def build_test():
    ref_token = "A7Q2K9M"
    dealer_name = "Shree Ganesh Agro"
    lang = "en"
    
    output = io.BytesIO()
    # Margins: push content down to avoid illustration, but leave max room for large text
    doc = SimpleDocTemplate(output, pagesize=portrait(A4), topMargin=85*mm, bottomMargin=10*mm, leftMargin=10*mm, rightMargin=10*mm)
    elements = []
    
    bg_path = 'backend/app/assets/poster_bg.jpg'
    logo_path = 'backend/app/assets/clsl-logo.png'
    mascot_path = 'backend/app/assets/mascot_new.png'
    
    def draw_bg(canvas, doc):
        canvas.saveState()
        try:
            width, height = A4
            canvas.drawImage(bg_path, 0, 0, width=width, height=height)
        except Exception:
            pass
        canvas.restoreState()

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle('Title', parent=styles['Heading1'], fontSize=32, spaceBefore=0, spaceAfter=2*mm, textColor=colors.HexColor("#064e3b"), alignment=1, fontName="Helvetica-Bold")
    subtitle_style = ParagraphStyle('Subtitle', parent=styles['Heading2'], fontSize=16, spaceAfter=5*mm, textColor=colors.HexColor("#0f766e"), alignment=1, fontName="Helvetica-Bold")
    desc_style = ParagraphStyle('Desc', parent=styles['Normal'], fontSize=18, spaceAfter=5*mm, textColor=colors.HexColor("#dc2626"), alignment=1, fontName="Helvetica-Bold") # Red/orange to stand out
    
    # Yellow background for the code to make it pop!
    code_style = ParagraphStyle('Code', parent=styles['Heading1'], fontSize=34, spaceBefore=4*mm, spaceAfter=2*mm, textColor=colors.black, alignment=1, fontName="Helvetica-Bold", backColor=colors.HexColor("#fef08a"), borderPadding=8)
    
    dealer_style = ParagraphStyle('Dealer', parent=styles['Heading2'], fontSize=20, spaceAfter=8*mm, textColor=colors.HexColor("#334155"), alignment=1, fontName="Helvetica-Bold")
    
    # Logo
    elements.append(RLImage(logo_path, width=70*mm, height=21*mm, kind='proportional'))
    elements.append(Spacer(1, 2*mm))
    
    elements.append(Paragraph("FARMER REWARD NETWORK", title_style))
    elements.append(Paragraph("SCAN TO UNLOCK EXCLUSIVE DISCOUNTS!", desc_style))
    
    # QR Code - larger so farmers know to scan it
    base_url = "https://ai.croplifescience.com"
    link = f"{base_url}/farmer/join?ref={ref_token}"
    qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_H, box_size=15, border=1)
    qr.add_data(link)
    qr.make(fit=True)
    img = qr.make_image(fill_color="#064e3b", back_color="white")
    qr_io = io.BytesIO()
    img.save(qr_io, format="PNG")
    qr_io.seek(0)
    
    elements.append(RLImage(qr_io, width=85*mm, height=85*mm))
    
    elements.append(Paragraph(f"REFERRAL CODE: {ref_token}", code_style))
    elements.append(Paragraph(f"{dealer_name}", dealer_style))
    
    # Instructions Headline
    how_to_style = ParagraphStyle('HowTo', fontSize=16, textColor=colors.HexColor("#064e3b"), alignment=1, fontName="Helvetica-Bold", spaceAfter=2*mm)
    elements.append(Paragraph("EASY 3-STEP PROCESS:", how_to_style))
    
    # 3 Steps Table - larger text
    step_num_style = ParagraphStyle('StepNum', fontSize=16, textColor=colors.white, alignment=1, fontName="Helvetica-Bold")
    step_title_style = ParagraphStyle('StepTitle', fontSize=13, spaceBefore=2*mm, spaceAfter=1*mm, textColor=colors.HexColor("#064e3b"), alignment=1, fontName="Helvetica-Bold")
    step_desc_style = ParagraphStyle('StepDesc', fontSize=11, leading=14, textColor=colors.HexColor("#1e293b"), alignment=1, fontName="Helvetica")
    
    def step_col(num, title, desc):
        return [
            Paragraph(f"<font color='white'> {num} </font>", ParagraphStyle(f'N{num}', parent=step_num_style, backColor=colors.HexColor("#10b981"), borderPadding=4, borderRadius=10)),
            Paragraph(title, step_title_style),
            Paragraph(desc, step_desc_style)
        ]
        
    t2 = Table([[step_col('1', 'DOWNLOAD APP', 'Play Store or App Store'), 
                 step_col('2', 'REGISTER', f'Use Code {ref_token}'), 
                 step_col('3', 'SCAN & EARN', 'Exclusive Discounts!')]], 
               colWidths=[48*mm, 48*mm, 48*mm])
    t2.setStyle(TableStyle([('VALIGN', (0,0), (-1,-1), 'TOP'), ('ALIGN', (0,0), (-1,-1), 'CENTER')]))
    
    try:
        mascot_img = RLImage(mascot_path, width=38*mm, height=48*mm, kind='proportional')
        layout_table = Table([[t2, mascot_img]], colWidths=[144*mm, 40*mm])
        layout_table.setStyle(TableStyle([('VALIGN', (0,0), (-1,-1), 'MIDDLE'), ('ALIGN', (0,0), (0,0), 'LEFT'), ('ALIGN', (1,0), (1,0), 'RIGHT')]))
        elements.append(layout_table)
    except Exception as e:
        print("mascot fail", e)
        elements.append(t2)
        
    doc.build(elements, onFirstPage=draw_bg, onLaterPages=draw_bg)
    
    with open('premium_poster_test_v2.pdf', 'wb') as f:
        f.write(output.getvalue())
    print("Done generating test.")

build_test()
