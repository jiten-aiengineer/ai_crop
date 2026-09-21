import directoryData from '../data/sales-contacts.json';

export type SalesDirectoryContact = {
  name: string;
  designation: string;
  state: string;
  territory: string;
  city: string;
  email: string;
  phone: string;
};

type DirectoryResult = {
  contacts: SalesDirectoryContact[];
  location?: string;
  kind: 'city' | 'territory' | 'state' | 'fallback' | 'need-location';
};

const contacts = directoryData as SalesDirectoryContact[];

// These are approved escalation contacts from the employee-directory export.
// They are only shown when a farmer asks for a place that is not in the list.
const UNLISTED_LOCATION_FALLBACKS = ['Rajeeokumar Pandey', 'Omnarayan Sharma'];

function normalise(value: string) {
  return value.toLocaleLowerCase('en-IN').replace(/[^a-z0-9]+/g, ' ').trim();
}

function rank(contact: SalesDirectoryContact) {
  if (/head/i.test(contact.designation)) return 0;
  if (/regional manager/i.test(contact.designation)) return 1;
  if (/area sales manager/i.test(contact.designation)) return 2;
  if (/sales officer/i.test(contact.designation)) return 3;
  return 4;
}

function uniqueContacts(values: SalesDirectoryContact[], limit = 2) {
  return [...new Map(values.map((contact) => [`${contact.email}|${contact.territory}`, contact])).values()]
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
    .slice(0, limit);
}

function includesLocation(question: string, candidate: string) {
  const value = normalise(candidate);
  return value.length >= 3 && (` ${question} `).includes(` ${value} `);
}

function guessedPlace(question: string) {
  const match = question.match(/\b(?:in|near|at|from)\s+([a-z][a-z .-]{2,50})/i);
  return match?.[1].replace(/\b(?:for|with|please|product|products|dealer|shop|store|stockist).*$/i, '').trim();
}

export function isSalesLocationQuestion(question: string) {
  return /(\bbuy\b|\bpurchase\b|\bdealer\b|\bretailer\b|\bshop\b|\bstore\b|\bstockist\b|\bavailability\b|\bavailable\b|\bdeliver(?:y)?\b|\bsales(?:person| representative| contact)?\b|\bcontact\b|\bwhere\b.*\b(get|buy|find)\b|खरीद|खरीदना|दुकान|विक्रेता|कहां|कहाँ|कहाँ से|ક્યાં|ખરીદ|દુકાન|কিনতে|দোকান)/i.test(question);
}

export function findSalesContacts(question: string): DirectoryResult {
  const lookup = normalise(question);
  const cityMatches = contacts.filter((contact) => includesLocation(lookup, contact.city));
  if (cityMatches.length) {
    const location = cityMatches[0].city;
    return { contacts: uniqueContacts(cityMatches), location, kind: 'city' };
  }

  const territoryMatches = contacts.filter((contact) => includesLocation(lookup, contact.territory));
  if (territoryMatches.length) {
    const location = territoryMatches[0].territory;
    return { contacts: uniqueContacts(territoryMatches), location, kind: 'territory' };
  }

  const stateMatches = contacts.filter((contact) => includesLocation(lookup, contact.state));
  if (stateMatches.length) {
    const location = stateMatches[0].state;
    return { contacts: uniqueContacts(stateMatches), location, kind: 'state' };
  }

  const requestedPlace = guessedPlace(question);
  if (!requestedPlace) return { contacts: [], kind: 'need-location' };
  const fallback = contacts.filter((contact) => UNLISTED_LOCATION_FALLBACKS.includes(contact.name));
  return { contacts: uniqueContacts(fallback), location: requestedPlace, kind: 'fallback' };
}

export function salesDirectoryAnswer(question: string, language = 'en') {
  const result = findSalesContacts(question);
  const copy: Record<string, { found: (place: string) => string; state: (place: string) => string; missing: (place: string) => string; ask: string }> = {
    en: {
      found: (place) => `I found active CLSL sales support for ${place}. I cannot confirm live dealer stock, price or delivery from this app, but the representative below can guide you to the appropriate authorised dealer or availability.`,
      state: (place) => `I found active CLSL sales support in ${place}. Please share your city or district with the representative so they can guide you to the appropriate authorised dealer or availability.`,
      missing: (place) => `I do not have a listed sales territory for ${place}. I cannot claim a nearby shop or live stock, so I have shown the approved escalation contacts below. They can guide you to the right CLSL representative or authorised dealer.`,
      ask: 'Please tell me the city or district where you want to buy the product. I will look for the approved CLSL sales contact for that area.',
    },
    hi: {
      found: (place) => `मुझे ${place} के लिए सक्रिय CLSL सेल्स सहायता मिली है। ऐप लाइव डीलर स्टॉक, कीमत या डिलीवरी की पुष्टि नहीं करता, लेकिन नीचे दिया प्रतिनिधि सही अधिकृत डीलर या उपलब्धता के बारे में मार्गदर्शन करेगा।`,
      state: (place) => `मुझे ${place} में सक्रिय CLSL सेल्स सहायता मिली है। प्रतिनिधि को अपना शहर या जिला बताएं, ताकि वे सही अधिकृत डीलर या उपलब्धता के बारे में मार्गदर्शन कर सकें।`,
      missing: (place) => `${place} के लिए सूचीबद्ध सेल्स क्षेत्र नहीं मिला। मैं पास की दुकान या लाइव स्टॉक का दावा नहीं कर सकता, इसलिए नीचे स्वीकृत सहायता संपर्क दिखाए हैं। वे सही CLSL प्रतिनिधि या अधिकृत डीलर तक मार्गदर्शन करेंगे।`,
      ask: 'कृपया वह शहर या जिला बताएं जहाँ आप उत्पाद खरीदना चाहते हैं। मैं उस क्षेत्र का स्वीकृत CLSL सेल्स संपर्क खोजूँगा।',
    },
  };
  const words = copy[language] || copy.en;
  if (result.kind === 'need-location') return { answer: words.ask, contacts: [] as SalesDirectoryContact[] };
  if (result.kind === 'fallback') return { answer: words.missing(result.location || 'that location'), contacts: result.contacts };
  if (result.kind === 'state') return { answer: words.state(result.location || 'your state'), contacts: result.contacts };
  return { answer: words.found(result.location || 'your area'), contacts: result.contacts };
}
