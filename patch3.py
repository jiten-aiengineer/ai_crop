import sys

with open('mobile/src/screens/auth/LoginScreen.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
skip = False
for line in lines:
    if "<View style={s.field}>" in line and "Mobile Number" in "".join(lines[lines.index(line):lines.index(line)+3]):
        skip = True
    
    if skip and "</View>" in line:
        skip = False
        continue
        
    if not skip:
        new_lines.append(line)

with open('mobile/src/screens/auth/LoginScreen.tsx', 'w', encoding='utf-8') as f:
    f.writelines(new_lines)
print("Removed mobile input from renderAccount")
