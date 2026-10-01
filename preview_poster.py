from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.utils import ImageReader
import qrcode
import io
from PIL import Image

output_path = r'C:\Users\Asus\.gemini\antigravity-ide\brain\04dd906e-7b1b-44db-a566-e5908888377c\poster_preview.pdf'
c = canvas.Canvas(output_path, pagesize=A4)
width, height = A4

logo_path = 'frontend/public/clsl-logo.png'
mascot_path = 'mobile/assets/images/mascot_new.png'

def draw_centered_text(c, text, y, font, size, color):
    c.setFont(font, size)
    c.setFillColor(color)
    text_width = c.stringWidth(text, font, size)
    c.drawString((width - text_width) / 2.0, y, text)

# Draw Logo
logo_img = Image.open(logo_path)
lw, lh = logo_img.size
aspect = lh / float(lw)
target_lw = 80 * mm
target_lh = target_lw * aspect
c.drawImage(logo_path, (width - target_lw) / 2.0, height - 20 * mm - target_lh, width=target_lw, height=target_lh, mask='auto')

curr_y = height - 25 * mm - target_lh

# Title
draw_centered_text(c, 'Farmer Reward Network', curr_y, 'Helvetica-Bold', 32, colors.HexColor('#11401b'))
curr_y -= 15 * mm

# Subtitle
draw_centered_text(c, 'REFERRAL PROGRAM', curr_y, 'Helvetica-Bold', 22, colors.black)
curr_y -= 8 * mm

# Desc
draw_centered_text(c, 'Scan to Unlock Exclusive Discounts & Rewards', curr_y, 'Helvetica', 16, colors.black)
curr_y -= 10 * mm

# QR
qr = qrcode.QRCode(box_size=15, border=1)
qr.add_data('https://ai.croplifescience.com/?ref=A7Q2K9M')
qr.make(fit=True)
img = qr.make_image(fill_color='black', back_color='white')
qr_io = io.BytesIO()
img.save(qr_io, format='PNG')
qr_io.seek(0)
qr_size = 110 * mm
curr_y -= qr_size
qr_image_reader = ImageReader(qr_io)
c.drawImage(qr_image_reader, (width - qr_size) / 2.0, curr_y, width=qr_size, height=qr_size)

curr_y -= 15 * mm
# Code
draw_centered_text(c, 'REFERRAL CODE: A7Q2K9M', curr_y, 'Helvetica-Bold', 26, colors.black)

curr_y -= 25 * mm

# Steps at the bottom
step_width = width / 3.0
step_y = curr_y

def draw_step(c, num_text, title, desc, cx):
    c.setFillColor(colors.HexColor('#7cb044'))
    c.circle(cx, step_y + 10 * mm, 5 * mm, stroke=0, fill=1)
    c.setFillColor(colors.white)
    c.setFont('Helvetica-Bold', 14)
    c.drawCentredString(cx, step_y + 8.5 * mm, num_text)
    
    c.setFillColor(colors.black)
    c.setFont('Helvetica-Bold', 12)
    c.drawCentredString(cx, step_y - 5 * mm, title)
    c.setFont('Helvetica', 10)
    c.drawCentredString(cx, step_y - 10 * mm, desc)

draw_step(c, '1', 'DOWNLOAD APP', 'Play Store or App Store', step_width * 0.5)
draw_step(c, '2', 'REGISTER', 'Use Code A7Q2K9M', step_width * 1.5)
draw_step(c, '3', 'SCAN', 'Earn Discounts!', step_width * 2.5)

# Mascot
mascot_img = Image.open(mascot_path)
mw, mh = mascot_img.size
mascot_aspect = mh / float(mw)
target_mw = 40 * mm
target_mh = target_mw * mascot_aspect
c.drawImage(mascot_path, width - target_mw - 10 * mm, 10 * mm, width=target_mw, height=target_mh, mask='auto')

c.save()
print('PDF preview generated')
