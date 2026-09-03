'use client';

import { useMemo, useState } from 'react';
import { catalog, CatalogProduct } from '../lib/catalog';
import { LanguageCode } from '../lib/i18n';

type Tool = 'spray' | 'farming';
type AreaUnit = 'acre' | 'hectare' | 'guntha';
type DoseUnit = 'ml' | 'g' | 'L' | 'kg';

const copy: Record<LanguageCode, Record<string, string>> = {
  en: { eyebrow:'PRACTICAL FARM TOOLS',title:'Plan every spray before mixing',intro:'Calculate product quantity, water, pump loads, packs to buy and estimated farmer cost.',spray:'Spray calculator',sprayHelp:'Quantity, mixing, packs and cost',farming:'Farm cost planner',farmingHelp:'Estimated field-operation cost',area:'Area to treat',unit:'Area unit',product:'CLSL product',choose:'Choose a catalogue product',catalogDose:'Printed catalogue dose',dose:'Approved dose per acre',water:'Water per acre',tank:'Pump size',packSize:'Pack size',packPrice:'Price per pack',applicationCost:'Spraying labour / machinery',totalProduct:'Product required',totalWater:'Water required',refills:'Pump loads',perTank:'Product / full tank',lastTank:'Final tank mix',packs:'Packs to buy',productCost:'Pack purchase cost',sprayCost:'Total spray cost',seed:'Seed / planting',irrigation:'Irrigation',protection:'Crop protection',labour:'Labour & machinery',harvest:'Harvest / transport',perAcre:'per acre',totalCost:'Estimated total cost',warning:'Planning aid only. Use only the dose, crop and method on the approved product label. Confirm local registration, protective equipment, weather and expert advice before application.',noDose:'Enter the approved per-acre dose from the label. Exact single-value catalogue doses may be prefilled; always confirm them.',mixTitle:'Live spray plan',mixText:'Your quantity and cost cards update immediately as field inputs change.',fullTank:'full tank',finalTank:'final tank',notNeeded:'Not required',costNote:'Cost uses whole packs to estimate the farmer’s cash purchase. It excludes unused product value.',autoDose:'Prefilled from a single-value catalogue dose — verify before use.' },
  hi: { eyebrow:'खेती के उपयोगी टूल',title:'मिश्रण से पहले पूरी स्प्रे योजना',intro:'दवा, पानी, पंप भराव, पैक और किसान लागत की गणना करें।',spray:'स्प्रे कैलकुलेटर',sprayHelp:'मात्रा, मिश्रण, पैक और लागत',farming:'खेती लागत योजना',farmingHelp:'खेत संचालन की अनुमानित लागत',area:'उपचार का क्षेत्र',unit:'क्षेत्र इकाई',product:'CLSL उत्पाद',choose:'कैटलॉग उत्पाद चुनें',catalogDose:'कैटलॉग में छपी खुराक',dose:'स्वीकृत प्रति एकड़ खुराक',water:'प्रति एकड़ पानी',tank:'पंप का आकार',packSize:'पैक आकार',packPrice:'प्रति पैक कीमत',applicationCost:'स्प्रे मजदूरी / मशीन',totalProduct:'आवश्यक उत्पाद',totalWater:'आवश्यक पानी',refills:'पंप भराव',perTank:'हर पूरे पंप में उत्पाद',lastTank:'अंतिम पंप मिश्रण',packs:'खरीदने के पैक',productCost:'पैक खरीद लागत',sprayCost:'कुल स्प्रे लागत',seed:'बीज / रोपण',irrigation:'सिंचाई',protection:'फसल सुरक्षा',labour:'मजदूरी और मशीन',harvest:'कटाई / परिवहन',perAcre:'प्रति एकड़',totalCost:'अनुमानित कुल लागत',warning:'यह योजना के लिए है। केवल स्वीकृत लेबल की फसल, खुराक और विधि अपनाएँ। स्थानीय पंजीकरण, सुरक्षा, मौसम और विशेषज्ञ सलाह जाँचें।',noDose:'लेबल से स्वीकृत प्रति एकड़ खुराक लिखें।',mixTitle:'लाइव स्प्रे योजना',mixText:'जानकारी बदलते ही मात्रा और लागत बदलती है।',fullTank:'पूरा पंप',finalTank:'अंतिम पंप',notNeeded:'जरूरत नहीं',costNote:'लागत पूरे पैक की नकद खरीद पर आधारित है।',autoDose:'कैटलॉग से भरी मात्रा — उपयोग से पहले जाँचें।' },
  gu: { eyebrow:'ઉપયોગી ખેત સાધનો',title:'મિશ્રણ પહેલાં સંપૂર્ણ સ્પ્રે યોજના',intro:'દવા, પાણી, પંપ, પેક અને ખેડૂત ખર્ચ ગણો.',spray:'સ્પ્રે કેલ્ક્યુલેટર',sprayHelp:'જથ્થો, મિશ્રણ, પેક અને ખર્ચ',farming:'ખેતી ખર્ચ યોજના',farmingHelp:'ખેત કામગીરીનો અંદાજ',area:'સારવાર વિસ્તાર',unit:'વિસ્તાર એકમ',product:'CLSL ઉત્પાદન',choose:'કેટલોગ ઉત્પાદન પસંદ કરો',catalogDose:'કેટલોગમાં છપાયેલી માત્રા',dose:'માન્ય એકર દીઠ માત્રા',water:'એકર દીઠ પાણી',tank:'પંપ કદ',packSize:'પેક કદ',packPrice:'પેકની કિંમત',applicationCost:'સ્પ્રે મજૂરી / મશીન',totalProduct:'જરૂરી ઉત્પાદન',totalWater:'જરૂરી પાણી',refills:'પંપ ભરવા',perTank:'પૂર્ણ પંપ દીઠ ઉત્પાદન',lastTank:'છેલ્લું પંપ મિશ્રણ',packs:'ખરીદવાના પેક',productCost:'પેક ખરીદી ખર્ચ',sprayCost:'કુલ સ્પ્રે ખર્ચ',seed:'બીજ / વાવેતર',irrigation:'સિંચાઈ',protection:'પાક સુરક્ષા',labour:'મજૂરી અને મશીન',harvest:'કાપણી / પરિવહન',perAcre:'એકર દીઠ',totalCost:'અંદાજિત કુલ ખર્ચ',warning:'આ આયોજન સહાય છે. માત્ર માન્ય લેબલ મુજબ પાક, માત્રા અને પદ્ધતિ વાપરો.',noDose:'લેબલ પરથી માન્ય એકર દીઠ માત્રા લખો.',mixTitle:'લાઇવ સ્પ્રે યોજના',mixText:'માહિતી બદલતાં જ પરિણામ બદલાય છે.',fullTank:'પૂર્ણ પંપ',finalTank:'છેલ્લું પંપ',notNeeded:'જરૂર નથી',costNote:'ખર્ચ સંપૂર્ણ પેક ખરીદી મુજબ છે.',autoDose:'કેટલોગથી ભરેલી માત્રા — ચકાસો.' },
  mr: { eyebrow:'उपयुक्त शेती साधने',title:'मिश्रणापूर्वी संपूर्ण फवारणी योजना',intro:'उत्पादन, पाणी, पंप, पॅक आणि शेतकरी खर्च मोजा.',spray:'फवारणी कॅल्क्युलेटर',sprayHelp:'मात्रा, मिश्रण, पॅक आणि खर्च',farming:'शेती खर्च योजना',farmingHelp:'शेती कामाचा अंदाज',area:'उपचार क्षेत्र',unit:'क्षेत्र एकक',product:'CLSL उत्पादन',choose:'कॅटलॉग उत्पादन निवडा',catalogDose:'कॅटलॉगवरील मात्रा',dose:'मान्य प्रति एकर मात्रा',water:'प्रति एकर पाणी',tank:'पंप आकार',packSize:'पॅक आकार',packPrice:'प्रति पॅक किंमत',applicationCost:'फवारणी मजुरी / यंत्र',totalProduct:'लागणारे उत्पादन',totalWater:'लागणारे पाणी',refills:'पंप भरणे',perTank:'पूर्ण पंपातील उत्पादन',lastTank:'शेवटचे पंप मिश्रण',packs:'खरेदीचे पॅक',productCost:'पॅक खरेदी खर्च',sprayCost:'एकूण फवारणी खर्च',seed:'बियाणे / लागवड',irrigation:'सिंचन',protection:'पीक संरक्षण',labour:'मजुरी आणि यंत्र',harvest:'कापणी / वाहतूक',perAcre:'प्रति एकर',totalCost:'अंदाजे एकूण खर्च',warning:'हे नियोजन साधन आहे. मान्य लेबलवरील पीक, मात्रा आणि पद्धतच वापरा.',noDose:'लेबलवरील मान्य प्रति एकर मात्रा लिहा.',mixTitle:'लाइव्ह फवारणी योजना',mixText:'माहिती बदलताच निकाल बदलतात.',fullTank:'पूर्ण पंप',finalTank:'शेवटचा पंप',notNeeded:'गरज नाही',costNote:'खर्च पूर्ण पॅक खरेदीवर आधारित आहे.',autoDose:'कॅटलॉगमधून भरलेली मात्रा — तपासा.' },
  bn: { eyebrow:'কাজের কৃষি সরঞ্জাম',title:'মেশানোর আগে সম্পূর্ণ স্প্রে পরিকল্পনা',intro:'পণ্য, পানি, পাম্প, প্যাক ও কৃষকের খরচ হিসাব করুন।',spray:'স্প্রে ক্যালকুলেটর',sprayHelp:'পরিমাণ, মিশ্রণ, প্যাক ও খরচ',farming:'চাষ খরচ পরিকল্পনা',farmingHelp:'মাঠের কাজের আনুমানিক খরচ',area:'জমির পরিমাণ',unit:'জমির একক',product:'CLSL পণ্য',choose:'ক্যাটালগ পণ্য বাছুন',catalogDose:'ক্যাটালগে ছাপা মাত্রা',dose:'অনুমোদিত একর প্রতি মাত্রা',water:'একর প্রতি পানি',tank:'পাম্পের আকার',packSize:'প্যাকের আকার',packPrice:'প্রতি প্যাক দাম',applicationCost:'স্প্রে শ্রম / যন্ত্র',totalProduct:'প্রয়োজনীয় পণ্য',totalWater:'প্রয়োজনীয় পানি',refills:'পাম্প ভরা',perTank:'পূর্ণ পাম্পে পণ্য',lastTank:'শেষ পাম্প মিশ্রণ',packs:'কেনার প্যাক',productCost:'প্যাক কেনার খরচ',sprayCost:'মোট স্প্রে খরচ',seed:'বীজ / রোপণ',irrigation:'সেচ',protection:'ফসল সুরক্ষা',labour:'শ্রম ও যন্ত্র',harvest:'ফসল তোলা / পরিবহন',perAcre:'একর প্রতি',totalCost:'আনুমানিক মোট খরচ',warning:'এটি পরিকল্পনার সহায়ক। অনুমোদিত লেবেলের ফসল, মাত্রা ও পদ্ধতি অনুসরণ করুন।',noDose:'লেবেল থেকে অনুমোদিত একর প্রতি মাত্রা লিখুন।',mixTitle:'লাইভ স্প্রে পরিকল্পনা',mixText:'তথ্য বদলালেই ফল বদলে যায়।',fullTank:'পূর্ণ পাম্প',finalTank:'শেষ পাম্প',notNeeded:'প্রয়োজন নেই',costNote:'খরচ পূর্ণ প্যাক কেনার হিসাবে।',autoDose:'ক্যাটালগ থেকে ভরা মাত্রা — যাচাই করুন।' },
  bho: { eyebrow:'खेती के काम के टूल',title:'मिलावे से पहिले पूरा स्प्रे योजना',intro:'दवाई, पानी, पंप, पैक आ किसान खर्च निकालीं।',spray:'स्प्रे कैलकुलेटर',sprayHelp:'मात्रा, मिश्रण, पैक आ खर्च',farming:'खेती खर्च योजना',farmingHelp:'खेत काम के अनुमान',area:'खेत के रकबा',unit:'रकबा इकाई',product:'CLSL उत्पाद',choose:'कैटलॉग उत्पाद चुनीं',catalogDose:'कैटलॉग में छपल खुराक',dose:'मान्य प्रति एकड़ खुराक',water:'प्रति एकड़ पानी',tank:'पंप आकार',packSize:'पैक आकार',packPrice:'प्रति पैक दाम',applicationCost:'स्प्रे मजदूरी / मशीन',totalProduct:'जरूरी उत्पाद',totalWater:'जरूरी पानी',refills:'पंप भराव',perTank:'पूरा पंप में उत्पाद',lastTank:'आखिरी पंप मिश्रण',packs:'खरीदे वाला पैक',productCost:'पैक खरीद खर्च',sprayCost:'कुल स्प्रे खर्च',seed:'बीज / रोपनी',irrigation:'सिंचाई',protection:'फसल सुरक्षा',labour:'मजदूरी आ मशीन',harvest:'कटनी / ढुलाई',perAcre:'प्रति एकड़',totalCost:'अनुमानित कुल खर्च',warning:'ई योजना खातिर बा। मंजूर लेबल के फसल, खुराक आ तरीका ही अपनाईं।',noDose:'लेबल से मान्य प्रति एकड़ खुराक लिखीं।',mixTitle:'लाइव स्प्रे योजना',mixText:'जानकारी बदलते नतीजा बदल जाई।',fullTank:'पूरा पंप',finalTank:'आखिरी पंप',notNeeded:'जरूरत नइखे',costNote:'खर्च पूरा पैक खरीदे के हिसाब से बा।',autoDose:'कैटलॉग से भरल मात्रा — जाँच लीं।' },
};

const protectionProducts = catalog.filter((product) => ['Insecticides','Fungicides','Weedicides','Antibiotic / Bactericide','Bio Stimulant','Plant Growth Regulator','Seed Treatment','Sticking Agent','Micro Fertilizers'].includes(product.category));

function acres(value: number, unit: AreaUnit) {
  if (unit === 'hectare') return value * 2.47105;
  if (unit === 'guntha') return value / 40;
  return value;
}

function number(value: string) { const parsed = Number(value); return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0; }
function display(value: number, digits = 2) { return value.toLocaleString(undefined, { maximumFractionDigits: digits }); }
function normaliseDoseUnit(value: string): DoseUnit {
  const unit = value.toLowerCase();
  if (unit === 'ml') return 'ml';
  if (unit === 'g' || unit === 'gm') return 'g';
  if (unit === 'kg') return 'kg';
  return 'L';
}

function doseSuggestion(product?: CatalogProduct): { value: number; unit: DoseUnit } | null {
  if (!product?.dose) return null;
  const text = product.dose.replace(/litres?|ltrs?|ltr/gi, 'L').replace(/grams?|gms?|gm/gi, 'g').replace(/acer/gi, 'acre');
  const pattern = /(\d+(?:\.\d+)?)\s*(ml|g|kg|L)\s*(?:\/|per)\s*(acre|hectare|ha)\b/gi;
  for (const match of text.matchAll(pattern)) {
    const prefix = text.slice(Math.max(0, (match.index || 0) - 8), match.index || 0);
    if (/(?:-|\bto)\s*$/i.test(prefix)) continue;
    const unit = normaliseDoseUnit(match[2]);
    const perAcre = /^(?:hectare|ha)$/i.test(match[3]) ? Number(match[1]) / 2.47105 : Number(match[1]);
    return { value: Number(perAcre.toFixed(2)), unit };
  }
  return null;
}

function packSuggestion(product: CatalogProduct | undefined, unit: DoseUnit) {
  if (!product?.packing) return 0;
  const match = product.packing.match(/(\d+(?:\.\d+)?)\s*(ml|gm|g|kg|litre|liter|ltr|L)\b/i);
  if (!match) return 0;
  const packUnit = normaliseDoseUnit(match[2]);
  let value = Number(match[1]);
  if (unit === 'ml' && packUnit === 'L') value *= 1000;
  else if (unit === 'L' && packUnit === 'ml') value /= 1000;
  else if (unit === 'g' && packUnit === 'kg') value *= 1000;
  else if (unit === 'kg' && packUnit === 'g') value /= 1000;
  else if (unit !== packUnit) return 0;
  return value;
}

export function FarmTools({ language }: { language: LanguageCode }) {
  const c = copy[language] || copy.en;
  const [tool, setTool] = useState<Tool>('spray');
  const [area, setArea] = useState('1');
  const [areaUnit, setAreaUnit] = useState<AreaUnit>('acre');
  const totalAcres = acres(number(area), areaUnit);

  return <section className="tools-workspace"><div className="tools-heading"><p className="eyebrow"><span />{c.eyebrow}</p><h1>{c.title}</h1><p>{c.intro}</p></div><div className="tool-tabs two-tabs">{([
    ['spray','◉',c.spray,c.sprayHelp],['farming','▦',c.farming,c.farmingHelp],
  ] as const).map(([id,icon,title,help]) => <button key={id} className={tool === id ? 'selected' : ''} onClick={() => setTool(id)}><span>{icon}</span><b>{title}</b><small>{help}</small></button>)}</div>
    <div className="calculator-shell"><AreaFields c={c} area={area} setArea={setArea} unit={areaUnit} setUnit={setAreaUnit} />{tool === 'spray' && <SprayCalculator c={c} totalAcres={totalAcres} />}{tool === 'farming' && <FarmingCalculator c={c} totalAcres={totalAcres} />}<p className="calculator-warning">ⓘ {c.warning}</p></div>
  </section>;
}

function AreaFields({ c, area, setArea, unit, setUnit }: { c: Record<string,string>; area:string; setArea:(value:string)=>void; unit:AreaUnit; setUnit:(value:AreaUnit)=>void }) {
  return <div className="area-fields"><label><span>{c.area}</span><input type="number" min="0" step="0.1" value={area} onChange={(event) => setArea(event.target.value)} /></label><label><span>{c.unit}</span><select value={unit} onChange={(event) => setUnit(event.target.value as AreaUnit)}><option value="acre">Acre</option><option value="hectare">Hectare</option><option value="guntha">Guntha</option></select></label></div>;
}

function SprayCalculator({ c, totalAcres }: { c:Record<string,string>; totalAcres:number }) {
  const [productId, setProductId] = useState('');
  const [dose, setDose] = useState('');
  const [doseUnit, setDoseUnit] = useState<DoseUnit>('ml');
  const [water, setWater] = useState('150');
  const [tank, setTank] = useState('15');
  const [packSize, setPackSize] = useState('');
  const [packPrice, setPackPrice] = useState('');
  const [applicationCost, setApplicationCost] = useState('250');
  const [autoDose, setAutoDose] = useState(false);
  const product = protectionProducts.find((item) => item.id === productId);

  const chooseProduct = (id: string) => {
    setProductId(id);
    const selected = protectionProducts.find((item) => item.id === id);
    const suggested = doseSuggestion(selected);
    if (suggested) {
      setDose(String(suggested.value)); setDoseUnit(suggested.unit); setAutoDose(true);
      const suggestedPack = packSuggestion(selected, suggested.unit);
      setPackSize(suggestedPack ? String(suggestedPack) : '');
    } else {
      setDose(''); setAutoDose(false); setPackSize('');
    }
  };

  const totalProduct = totalAcres * number(dose);
  const totalWater = totalAcres * number(water);
  const tankSize = number(tank);
  const loads = tankSize && totalWater ? Math.ceil(totalWater / tankSize) : 0;
  const concentration = totalWater ? totalProduct / totalWater : 0;
  const fullTankProduct = concentration * Math.min(tankSize, totalWater);
  const finalTankWater = loads ? totalWater - tankSize * Math.max(0, loads - 1) : 0;
  const finalTankProduct = concentration * finalTankWater;
  const packCount = number(packSize) && totalProduct ? Math.ceil(totalProduct / number(packSize)) : 0;
  const purchaseCost = packCount * number(packPrice);
  const fieldCost = totalAcres * number(applicationCost);
  const totalSprayCost = purchaseCost + fieldCost;

  return <div className="calculator-body spray-calculator"><div className="spray-plan-head"><div><small>{c.mixTitle}</small><h2>{c.mixText}</h2></div><div className="spray-animation" aria-hidden="true"><span className="spray-nozzle">⌁</span><i /><i /><i /><b>♧</b></div></div>
    <label className="product-select"><span>{c.product}</span><select value={productId} onChange={(event) => chooseProduct(event.target.value)}><option value="">{c.choose}</option>{protectionProducts.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.category}</option>)}</select></label>
    {product && <div className="catalog-dose"><small>{c.catalogDose}</small><b>{product.dose || '—'}</b><span>{product.commonName}</span></div>}
    <div className="calculator-inputs"><label><span>{c.dose}</span><input type="number" min="0" step="0.01" value={dose} onChange={(event) => { setDose(event.target.value); setAutoDose(false); }} placeholder="0" /><select aria-label="Dose unit" value={doseUnit} onChange={(event) => { const unit = event.target.value as DoseUnit; setDoseUnit(unit); setPackSize(String(packSuggestion(product, unit) || '')); }}><option>ml</option><option>g</option><option>L</option><option>kg</option></select></label><label><span>{c.water}</span><input type="number" min="0" step="1" value={water} onChange={(event) => setWater(event.target.value)} /><em>L/ac</em></label><label><span>{c.tank}</span><input type="number" min="1" step="1" value={tank} onChange={(event) => setTank(event.target.value)} /><em>L</em></label></div>
    {autoDose ? <p className="dose-help success">✓ {c.autoDose}</p> : !number(dose) && <p className="dose-help">{c.noDose}</p>}
    <div className="calculator-inputs purchase-inputs"><label><span>{c.packSize}</span><input type="number" min="0" step="0.01" value={packSize} onChange={(event) => setPackSize(event.target.value)} placeholder="0" /><em>{doseUnit}</em></label><label><span>{c.packPrice}</span><input type="number" min="0" step="1" value={packPrice} onChange={(event) => setPackPrice(event.target.value)} placeholder="0" /><em>₹</em></label><label><span>{c.applicationCost}</span><input type="number" min="0" step="10" value={applicationCost} onChange={(event) => setApplicationCost(event.target.value)} /><em>₹/ac</em></label></div>
    <div className="mix-breakdown"><article><span>01</span><div><small>{c.fullTank}</small><b>{display(Math.min(tankSize, totalWater))} L + {display(fullTankProduct)} {doseUnit}</b></div></article><article><span>02</span><div><small>{c.finalTank}</small><b>{loads ? `${display(finalTankWater)} L + ${display(finalTankProduct)} ${doseUnit}` : c.notNeeded}</b></div></article></div>
    <Results items={[[c.totalProduct,`${display(totalProduct)} ${doseUnit}`],[c.totalWater,`${display(totalWater)} L`],[c.refills,`${loads}`],[c.perTank,`${display(fullTankProduct)} ${doseUnit}`],[c.lastTank,loads ? `${display(finalTankProduct)} ${doseUnit}` : '—'],[c.packs,`${packCount}`],[c.productCost,`₹${display(purchaseCost,0)}`],[c.sprayCost,`₹${display(totalSprayCost,0)}`]]} />
    <p className="cost-note">{c.costNote}</p>
  </div>;
}

function FarmingCalculator({ c, totalAcres }: { c:Record<string,string>; totalAcres:number }) {
  const [costs, setCosts] = useState({ seed:'2500', irrigation:'2000', protection:'3000', labour:'6000', harvest:'2500' });
  const fields: Array<[keyof typeof costs,string]> = [['seed',c.seed],['irrigation',c.irrigation],['protection',c.protection],['labour',c.labour],['harvest',c.harvest]];
  const perAcre = useMemo(() => Object.values(costs).reduce((sum, value) => sum + number(value), 0), [costs]);
  return <div className="calculator-body"><div className="cost-inputs">{fields.map(([key,label]) => <label key={key}><span>{label}<small>{c.perAcre}</small></span><b>₹</b><input type="number" min="0" step="100" value={costs[key]} onChange={(event) => setCosts({ ...costs, [key]:event.target.value })} /></label>)}</div><Results items={[[c.perAcre,`₹${display(perAcre,0)}`],[c.totalCost,`₹${display(perAcre * totalAcres,0)}`]]} /></div>;
}

function Results({ items }: { items:string[][] }) { return <div className="calculation-results">{items.map(([label,value],index) => <article key={label} className={index === 0 || index === items.length - 1 ? 'primary-result' : ''} style={{ animationDelay: `${index * 45}ms` }}><small>{label}</small><b>{value}</b></article>)}</div>; }
