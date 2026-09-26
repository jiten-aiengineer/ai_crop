from PIL import Image
import math

def process_image():
    # Load original image
    img = Image.open('mobile/assets/images/source_farmer.png').convert('RGBA')
    width, height = img.size
    
    farmer_img = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    field_img = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    
    farmer_pixels = farmer_img.load()
    field_pixels = field_img.load()
    orig_pixels = img.load()
    
    # Simple color threshold for the blue farmer
    for y in range(height):
        for x in range(width):
            r, g, b, a = orig_pixels[x, y]
            
            # The farmer is a distinct blue: low red, low green, high blue
            # The spray is a lighter blue/cyan. Let's capture both.
            # Grass is green (g > r, g > b)
            # Background is white (r>240, g>240, b>240)
            
            is_blue = (b > r + 20 and b > g + 20) or (b > 200 and r < 200 and g > 150) # Catch spray too
            
            if is_blue:
                farmer_pixels[x, y] = (r, g, b, a)
                # We leave a hole in the field image, we'll fill it next
                field_pixels[x, y] = (0, 0, 0, 0)
            else:
                farmer_pixels[x, y] = (0, 0, 0, 0)
                # Keep grass and white background
                if r < 240 or g < 240 or b < 240:
                    field_pixels[x, y] = (r, g, b, a)
                else:
                    # Make white background transparent
                    field_pixels[x, y] = (0, 0, 0, 0)

    # Fill the hole in the field using pixels from the right side of the image
    for y in range(height):
        for x in range(width):
            _, _, _, a = field_pixels[x, y]
            if a == 0:
                # Is it supposed to be grass? Check if a pixel far to the right is grass
                # We know the hole is around x=100 to x=300
                if 50 < x < width - 150:
                    src_x = x + 150
                    if src_x < width:
                        r, g, b, a2 = field_pixels[src_x, y]
                        if a2 > 0:
                            field_pixels[x, y] = (r, g, b, a2)

    farmer_img.save('mobile/assets/images/farmer_only.png')
    field_img.save('mobile/assets/images/field_only.png')
    print("Extraction complete.")

if __name__ == '__main__':
    process_image()
