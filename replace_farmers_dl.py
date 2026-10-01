import sys

with open('mobile/src/screens/dealer/DealerFarmersScreen.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

old_bad = "await downloadAndShareFile(url, \CLSL_Poster_.pdf\);"
new_good = "await downloadAndShareFile(url, \CLSL_Poster_\.pdf\);"

content = content.replace(old_bad, new_good)

with open('mobile/src/screens/dealer/DealerFarmersScreen.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print("Fixed DealerFarmersScreen")
