import re

def update():
    with open('mobile/src/screens/home/HomeScreen.tsx', 'r', encoding='utf-8') as f:
        home = f.read()

    with open('mobile/src/screens/dealer/DealerHomeScreen.tsx', 'r', encoding='utf-8') as f:
        dealer = f.read()
    
    # Extract the StyleSheet from HomeScreen
    home_style = re.search(r'const s = StyleSheet\.create\({(.*)}\);', home, re.DOTALL).group(1)
    
    # Replace StyleSheet in DealerHomeScreen
    dealer = re.sub(r'const s = StyleSheet\.create\({(.*)}\);', f'const s = StyleSheet.create({{{home_style}}});', dealer, flags=re.DOTALL)
    
    with open('mobile/src/screens/dealer/DealerHomeScreen.tsx', 'w', encoding='utf-8') as f:
        f.write(dealer)

update()
