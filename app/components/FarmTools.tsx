'use client';

import { useMemo, useState } from 'react';
import { catalog } from '../lib/catalog';
import { LanguageCode } from '../lib/i18n';

type Tool = 'pesticide' | 'fertilizer' | 'farming';
type AreaUnit = 'acre' | 'hectare' | 'guntha';

const copy: Record<LanguageCode, Record<string, string>> = {
  en: { eyebrow:'PRACTICAL FARM TOOLS',title:'Calculate before you apply',intro:'Plan quantities and costs for your actual field area.',pesticide:'Spray calculator',pesticideHelp:'Product, water and pump refills',fertilizer:'Fertilizer calculator',fertilizerHelp:'Total fertilizer and bags',farming:'Farming cost calculator',farmingHelp:'Estimated input cost',area:'Area to treat',unit:'Area unit',product:'CLSL product',choose:'Choose a catalogue product',catalogDose:'Catalogue dose',dose:'Dose per acre',doseUnit:'Dose unit',water:'Water per acre',tank:'Pump size',totalProduct:'Total product',totalWater:'Total water',refills:'Pump refills',perTank:'Product per refill',rate:'Recommended fertilizer',bag:'Bag size',totalFertilizer:'Total fertilizer',bags:'Bags required',seed:'Seed / planting cost',fertCost:'Fertilizer cost',protection:'Crop protection cost',labour:'Labour & machinery',perAcre:'per acre',totalCost:'Estimated total cost',warning:'Calculator only. Confirm the approved product label, crop registration, dose, water volume and local expert advice before application.',noDose:'Enter the approved per-acre dose from the product label.' },
  hi: { eyebrow:'खेती के उपयोगी टूल',title:'प्रयोग से पहले गणना करें',intro:'अपने खेत के वास्तविक क्षेत्र के लिए मात्रा और लागत निकालें।',pesticide:'स्प्रे कैलकुलेटर',pesticideHelp:'दवा, पानी और पंप भराव',fertilizer:'खाद कैलकुलेटर',fertilizerHelp:'कुल खाद और बैग',farming:'खेती लागत कैलकुलेटर',farmingHelp:'अनुमानित लागत',area:'इलाज का क्षेत्र',unit:'क्षेत्र इकाई',product:'CLSL उत्पाद',choose:'कैटलॉग उत्पाद चुनें',catalogDose:'कैटलॉग खुराक',dose:'प्रति एकड़ खुराक',doseUnit:'खुराक इकाई',water:'प्रति एकड़ पानी',tank:'पंप आकार',totalProduct:'कुल उत्पाद',totalWater:'कुल पानी',refills:'पंप भराव',perTank:'हर पंप में उत्पाद',rate:'सुझाई खाद',bag:'बैग आकार',totalFertilizer:'कुल खाद',bags:'आवश्यक बैग',seed:'बीज / रोपण लागत',fertCost:'खाद लागत',protection:'फसल सुरक्षा लागत',labour:'मजदूरी और मशीन',perAcre:'प्रति एकड़',totalCost:'अनुमानित कुल लागत',warning:'यह केवल गणना है। प्रयोग से पहले स्वीकृत लेबल, फसल पंजीकरण, खुराक और स्थानीय विशेषज्ञ सलाह जाँचें।',noDose:'उत्पाद लेबल से स्वीकृत प्रति एकड़ खुराक लिखें।' },
  gu: { eyebrow:'ઉપયોગી ખેત સાધનો',title:'વપરાશ પહેલાં ગણતરી કરો',intro:'તમારા ખેતરના વિસ્તાર માટે જથ્થો અને ખર્ચ ગણો.',pesticide:'સ્પ્રે કેલ્ક્યુલેટર',pesticideHelp:'દવા, પાણી અને પંપ ભરવા',fertilizer:'ખાતર કેલ્ક્યુલેટર',fertilizerHelp:'કુલ ખાતર અને બેગ',farming:'ખેતી ખર્ચ કેલ્ક્યુલેટર',farmingHelp:'અંદાજિત ખર્ચ',area:'વિસ્તાર',unit:'વિસ્તાર એકમ',product:'CLSL ઉત્પાદન',choose:'કેટલોગ ઉત્પાદન પસંદ કરો',catalogDose:'કેટલોગ માત્રા',dose:'એકર દીઠ માત્રા',doseUnit:'માત્રા એકમ',water:'એકર દીઠ પાણી',tank:'પંપ કદ',totalProduct:'કુલ ઉત્પાદન',totalWater:'કુલ પાણી',refills:'પંપ રિફિલ',perTank:'દર પંપમાં ઉત્પાદન',rate:'ભલામણ ખાતર',bag:'બેગ કદ',totalFertilizer:'કુલ ખાતર',bags:'જરૂરી બેગ',seed:'બીજ ખર્ચ',fertCost:'ખાતર ખર્ચ',protection:'પાક સુરક્ષા ખર્ચ',labour:'મજૂરી અને મશીન',perAcre:'એકર દીઠ',totalCost:'અંદાજિત કુલ ખર્ચ',warning:'આ માત્ર ગણતરી છે. ઉપયોગ પહેલાં માન્ય લેબલ અને સ્થાનિક સલાહ તપાસો.',noDose:'લેબલ પરથી માન્ય એકર દીઠ માત્રા લખો.' },
  mr: { eyebrow:'उपयुक्त शेती साधने',title:'वापरापूर्वी गणना करा',intro:'तुमच्या क्षेत्रासाठी मात्रा आणि खर्च मोजा.',pesticide:'फवारणी कॅल्क्युलेटर',pesticideHelp:'औषध, पाणी आणि पंप भरणे',fertilizer:'खत कॅल्क्युलेटर',fertilizerHelp:'एकूण खत आणि पिशव्या',farming:'शेती खर्च कॅल्क्युलेटर',farmingHelp:'अंदाजे खर्च',area:'क्षेत्र',unit:'क्षेत्र एकक',product:'CLSL उत्पादन',choose:'कॅटलॉग उत्पादन निवडा',catalogDose:'कॅटलॉग मात्रा',dose:'प्रति एकर मात्रा',doseUnit:'मात्रा एकक',water:'प्रति एकर पाणी',tank:'पंप आकार',totalProduct:'एकूण उत्पादन',totalWater:'एकूण पाणी',refills:'पंप भरणे',perTank:'प्रति पंप उत्पादन',rate:'शिफारस केलेले खत',bag:'पिशवी आकार',totalFertilizer:'एकूण खत',bags:'लागणाऱ्या पिशव्या',seed:'बियाणे खर्च',fertCost:'खत खर्च',protection:'पीक संरक्षण खर्च',labour:'मजुरी आणि यंत्र',perAcre:'प्रति एकर',totalCost:'अंदाजे एकूण खर्च',warning:'ही फक्त गणना आहे. वापरापूर्वी मान्य लेबल आणि स्थानिक सल्ला तपासा.',noDose:'लेबलवरील मान्य प्रति एकर मात्रा लिहा.' },
  bn: { eyebrow:'কাজের কৃষি সরঞ্জাম',title:'প্রয়োগের আগে হিসাব করুন',intro:'আপনার জমির জন্য পরিমাণ ও খরচ হিসাব করুন।',pesticide:'স্প্রে ক্যালকুলেটর',pesticideHelp:'ওষুধ, পানি ও পাম্প রিফিল',fertilizer:'সার ক্যালকুলেটর',fertilizerHelp:'মোট সার ও ব্যাগ',farming:'চাষ খরচ ক্যালকুলেটর',farmingHelp:'আনুমানিক খরচ',area:'জমির পরিমাণ',unit:'জমির একক',product:'CLSL পণ্য',choose:'ক্যাটালগ পণ্য বাছুন',catalogDose:'ক্যাটালগ মাত্রা',dose:'একর প্রতি মাত্রা',doseUnit:'মাত্রার একক',water:'একর প্রতি পানি',tank:'পাম্পের আকার',totalProduct:'মোট পণ্য',totalWater:'মোট পানি',refills:'পাম্প রিফিল',perTank:'প্রতি পাম্পে পণ্য',rate:'প্রস্তাবিত সার',bag:'ব্যাগের আকার',totalFertilizer:'মোট সার',bags:'প্রয়োজনীয় ব্যাগ',seed:'বীজ খরচ',fertCost:'সারের খরচ',protection:'ফসল সুরক্ষা খরচ',labour:'শ্রম ও যন্ত্র',perAcre:'প্রতি একর',totalCost:'আনুমানিক মোট খরচ',warning:'এটি শুধু হিসাব। ব্যবহারের আগে অনুমোদিত লেবেল ও স্থানীয় পরামর্শ দেখুন।',noDose:'লেবেল থেকে অনুমোদিত একর প্রতি মাত্রা লিখুন।' },
  bho: { eyebrow:'खेती के काम के टूल',title:'डाले से पहिले हिसाब करीं',intro:'अपना खेत खातिर मात्रा आ खर्च निकालीं।',pesticide:'स्प्रे कैलकुलेटर',pesticideHelp:'दवाई, पानी आ पंप भराव',fertilizer:'खाद कैलकुलेटर',fertilizerHelp:'कुल खाद आ बोरा',farming:'खेती खर्च कैलकुलेटर',farmingHelp:'अनुमानित खर्च',area:'खेत के रकबा',unit:'रकबा इकाई',product:'CLSL उत्पाद',choose:'कैटलॉग उत्पाद चुनीं',catalogDose:'कैटलॉग मात्रा',dose:'प्रति एकड़ मात्रा',doseUnit:'मात्रा इकाई',water:'प्रति एकड़ पानी',tank:'पंप आकार',totalProduct:'कुल उत्पाद',totalWater:'कुल पानी',refills:'पंप भराव',perTank:'हर पंप में उत्पाद',rate:'सुझावल खाद',bag:'बोरा आकार',totalFertilizer:'कुल खाद',bags:'जरूरी बोरा',seed:'बीज खर्च',fertCost:'खाद खर्च',protection:'फसल सुरक्षा खर्च',labour:'मजदूरी आ मशीन',perAcre:'प्रति एकड़',totalCost:'अनुमानित कुल खर्च',warning:'ई खाली गणना बा। डाले से पहिले मान्य लेबल आ स्थानीय सलाह देखीं।',noDose:'लेबल से मान्य प्रति एकड़ मात्रा लिखीं।' },
};

const protectionProducts = catalog.filter((product) => ['Insecticides','Fungicides','Weedicides','Antibiotic / Bactericide','Bio Stimulant','Plant Growth Regulator','Micro Fertilizers'].includes(product.category));

function acres(value: number, unit: AreaUnit) {
  if (unit === 'hectare') return value * 2.47105;
  if (unit === 'guntha') return value / 40;
  return value;
}

function number(value: string) { const parsed = Number(value); return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0; }
function display(value: number, digits = 2) { return value.toLocaleString(undefined, { maximumFractionDigits: digits }); }

export function FarmTools({ language }: { language: LanguageCode }) {
  const c = copy[language] || copy.en;
  const [tool, setTool] = useState<Tool>('pesticide');
  const [area, setArea] = useState('1');
  const [areaUnit, setAreaUnit] = useState<AreaUnit>('acre');
  const totalAcres = acres(number(area), areaUnit);

  return <section className="tools-workspace"><div className="tools-heading"><p className="eyebrow"><span />{c.eyebrow}</p><h1>{c.title}</h1><p>{c.intro}</p></div><div className="tool-tabs">{([
    ['pesticide','◉',c.pesticide,c.pesticideHelp],['fertilizer','◇',c.fertilizer,c.fertilizerHelp],['farming','▦',c.farming,c.farmingHelp],
  ] as const).map(([id,icon,title,help]) => <button key={id} className={tool === id ? 'selected' : ''} onClick={() => setTool(id)}><span>{icon}</span><b>{title}</b><small>{help}</small></button>)}</div>
    <div className="calculator-shell"><AreaFields c={c} area={area} setArea={setArea} unit={areaUnit} setUnit={setAreaUnit} />{tool === 'pesticide' && <PesticideCalculator c={c} totalAcres={totalAcres} />}{tool === 'fertilizer' && <FertilizerCalculator c={c} totalAcres={totalAcres} />}{tool === 'farming' && <FarmingCalculator c={c} totalAcres={totalAcres} />}<p className="calculator-warning">ⓘ {c.warning}</p></div>
  </section>;
}

function AreaFields({ c, area, setArea, unit, setUnit }: { c: Record<string,string>; area:string; setArea:(value:string)=>void; unit:AreaUnit; setUnit:(value:AreaUnit)=>void }) {
  return <div className="area-fields"><label><span>{c.area}</span><input type="number" min="0" step="0.1" value={area} onChange={(event) => setArea(event.target.value)} /></label><label><span>{c.unit}</span><select value={unit} onChange={(event) => setUnit(event.target.value as AreaUnit)}><option value="acre">Acre</option><option value="hectare">Hectare</option><option value="guntha">Guntha</option></select></label></div>;
}

function PesticideCalculator({ c, totalAcres }: { c:Record<string,string>; totalAcres:number }) {
  const [productId, setProductId] = useState(''); const [dose, setDose] = useState(''); const [doseUnit, setDoseUnit] = useState('ml'); const [water, setWater] = useState('150'); const [tank, setTank] = useState('15');
  const product = protectionProducts.find((item) => item.id === productId);
  const totalProduct = totalAcres * number(dose); const totalWater = totalAcres * number(water); const refills = number(tank) ? Math.ceil(totalWater / number(tank)) : 0; const perTank = refills ? totalProduct / refills : 0;
  return <div className="calculator-body"><label className="product-select"><span>{c.product}</span><select value={productId} onChange={(event) => setProductId(event.target.value)}><option value="">{c.choose}</option>{protectionProducts.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.category}</option>)}</select></label>{product && <div className="catalog-dose"><small>{c.catalogDose}</small><b>{product.dose || '—'}</b><span>{product.commonName}</span></div>}<div className="calculator-inputs"><label><span>{c.dose}</span><input type="number" min="0" step="0.1" value={dose} onChange={(event) => setDose(event.target.value)} placeholder="0" /><select value={doseUnit} onChange={(event) => setDoseUnit(event.target.value)}><option>ml</option><option>g</option><option>kg</option><option>L</option></select></label><label><span>{c.water}</span><input type="number" min="0" step="1" value={water} onChange={(event) => setWater(event.target.value)} /><em>L/ac</em></label><label><span>{c.tank}</span><input type="number" min="1" step="1" value={tank} onChange={(event) => setTank(event.target.value)} /><em>L</em></label></div>{!number(dose) && <p className="dose-help">{c.noDose}</p>}<Results items={[[c.totalProduct,`${display(totalProduct)} ${doseUnit}`],[c.totalWater,`${display(totalWater)} L`],[c.refills,`${refills}`],[c.perTank,`${display(perTank)} ${doseUnit}`]]} /></div>;
}

function FertilizerCalculator({ c, totalAcres }: { c:Record<string,string>; totalAcres:number }) {
  const [rate, setRate] = useState('50'); const [bag, setBag] = useState('50'); const total = totalAcres * number(rate); const bags = number(bag) ? total / number(bag) : 0;
  return <div className="calculator-body"><div className="calculator-inputs two"><label><span>{c.rate}</span><input type="number" min="0" step="0.1" value={rate} onChange={(event) => setRate(event.target.value)} /><em>kg/ac</em></label><label><span>{c.bag}</span><input type="number" min="1" step="1" value={bag} onChange={(event) => setBag(event.target.value)} /><em>kg</em></label></div><Results items={[[c.totalFertilizer,`${display(total)} kg`],[c.bags,display(bags)]]} /></div>;
}

function FarmingCalculator({ c, totalAcres }: { c:Record<string,string>; totalAcres:number }) {
  const [costs, setCosts] = useState({ seed:'2500', fertilizer:'4500', protection:'3000', labour:'6000' });
  const fields: Array<[keyof typeof costs,string]> = [['seed',c.seed],['fertilizer',c.fertCost],['protection',c.protection],['labour',c.labour]];
  const perAcre = useMemo(() => Object.values(costs).reduce((sum, value) => sum + number(value), 0), [costs]);
  return <div className="calculator-body"><div className="cost-inputs">{fields.map(([key,label]) => <label key={key}><span>{label}<small>{c.perAcre}</small></span><b>₹</b><input type="number" min="0" step="100" value={costs[key]} onChange={(event) => setCosts({ ...costs, [key]:event.target.value })} /></label>)}</div><Results items={[[c.perAcre,`₹${display(perAcre,0)}`],[c.totalCost,`₹${display(perAcre * totalAcres,0)}`]]} /></div>;
}

function Results({ items }: { items:string[][] }) { return <div className="calculation-results">{items.map(([label,value],index) => <article key={label} className={index === 0 ? 'primary-result' : ''}><small>{label}</small><b>{value}</b></article>)}</div>; }
