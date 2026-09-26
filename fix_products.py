import json

path = 'frontend/app/data/products.json'
with open(path, 'r', encoding='utf-8') as f:
    products = json.load(f)

for p in products:
    if 'catalogCrops' in p:
        new_crops = []
        for c in p['catalogCrops']:
            if c == 'Mulbery': c = 'Mulberry'
            if c == 'Black paper': c = 'Black Pepper'
            if c == 'Cardomom': c = 'Cardamom'
            if c == 'Saybean': c = 'Soybean'
            if c == 'roses': c = 'Rose'
            if c == 'and apples': c = 'Apple'
            
            # Remove "Non-Crop" categories mentioned in the issue
            if c in ['Aquatic weeds', 'Bunds and Fallow Land', 'non crop area', 'Non-Crop Areas']:
                continue
            
            new_crops.append(c)
        p['catalogCrops'] = list(set(new_crops))

with open(path, 'w', encoding='utf-8') as f:
    json.dump(products, f, indent=2)
