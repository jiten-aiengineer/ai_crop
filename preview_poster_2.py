from reportlab.lib.pagesizes import A4, portrait
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image as RLImage, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib import colors
import qrcode
import io

def generate_poster():
    dealer_name = "Shree Ganesh Agro Agency"
    ref_token = "A7Q2K9M"
    lang = "en"
    
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
    doc = SimpleDocTemplate(output, pagesize=portrait(A4), topMargin=20*mm, bottomMargin=20*mm, leftMargin=15*mm, rightMargin=15*mm)
    elements = []
    
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        'Title', parent=styles['Heading1'], fontSize=34, spaceBefore=5*mm, spaceAfter=5*mm, textColor=colors.HexColor("#11401b"), alignment=1, fontName="Helvetica-Bold"
    )
    dealer_style = ParagraphStyle(
        'Dealer', parent=styles['Heading2'], fontSize=18, spaceAfter=3*mm, textColor=colors.HexColor("#000000"), alignment=1, fontName="Helvetica-Bold"
    )
    subtitle_style = ParagraphStyle(
        'Subtitle', parent=styles['Heading2'], fontSize=20, spaceAfter=2*mm, textColor=colors.black, alignment=1, fontName="Helvetica-Bold"
    )
    desc_style = ParagraphStyle(
        'Desc', parent=styles['Normal'], fontSize=16, spaceAfter=8*mm, textColor=colors.HexColor("#333333"), alignment=1, fontName="Helvetica"
    )
    code_style = ParagraphStyle(
        'Code', parent=styles['Heading1'], fontSize=30, spaceBefore=5*mm, spaceAfter=5*mm, textColor=colors.black, alignment=1, fontName="Helvetica-Bold"
    )
    
    # Logo
    try:
        elements.append(RLImage('frontend/public/clsl-logo.png', width=70*mm, height=22*mm, kind='proportional'))
    except:
        pass
        
    elements.append(Paragraph("Farmer Reward Network", title_style))
    
    elements.append(Paragraph("REFERRAL PROGRAM", subtitle_style))
    elements.append(Paragraph("Scan to Unlock Exclusive Discounts & Rewards", desc_style))
    
    # QR Code
    elements.append(RLImage(qr_io, width=100*mm, height=100*mm))
    
    elements.append(Spacer(1, 5*mm))
    elements.append(Paragraph(f"REFERRAL CODE: {ref_token}", code_style))
    elements.append(Paragraph(f"{dealer_name}", dealer_style))
    elements.append(Spacer(1, 10*mm))
    
    # 3 Steps Table
    step_num_style = ParagraphStyle('StepNum', fontSize=14, textColor=colors.white, alignment=1, fontName="Helvetica-Bold")
    step_title_style = ParagraphStyle('StepTitle', fontSize=12, spaceBefore=2*mm, textColor=colors.black, alignment=1, fontName="Helvetica-Bold")
    step_desc_style = ParagraphStyle('StepDesc', fontSize=10, leading=12, textColor=colors.black, alignment=1, fontName="Helvetica")
    
    step1 = "Play Store or App Store"
    step2 = f"Sign up & use code {ref_token}"
    step3 = "Get exclusive discounts!"
    
    if lang == 'hi':
        step1 = "Play Store / App Store se"
        step2 = f"Code {ref_token} use karein"
        step3 = "Discounts paayein!"
        
    col1 = [
        Paragraph("<font color='white'>1</font>", ParagraphStyle('N1', parent=step_num_style, backColor=colors.HexColor("#7cb044"), borderPadding=4, borderRadius=10)),
        Paragraph("DOWNLOAD APP", step_title_style),
        Paragraph(step1, step_desc_style)
    ]
    col2 = [
        Paragraph("<font color='white'>2</font>", ParagraphStyle('N2', parent=step_num_style, backColor=colors.HexColor("#7cb044"), borderPadding=4, borderRadius=10)),
        Paragraph("REGISTER", step_title_style),
        Paragraph(step2, step_desc_style)
    ]
    col3 = [
        Paragraph("<font color='white'>3</font>", ParagraphStyle('N3', parent=step_num_style, backColor=colors.HexColor("#7cb044"), borderPadding=4, borderRadius=10)),
        Paragraph("SCAN & EARN", step_title_style),
        Paragraph(step3, step_desc_style)
    ]
    
    t = Table([[col1, col2, col3]], colWidths=[60*mm, 60*mm, 60*mm])
    t.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
    ]))
    
    elements.append(t)
    
    doc.build(elements)
    
    with open('poster_preview_2.pdf', 'wb') as f:
        f.write(output.getvalue())

generate_poster()
