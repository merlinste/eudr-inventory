export const PARTNER_KIND = [
  { value: 'importer', label: 'Importeur' },
  { value: 'roaster', label: 'Röster' },
  { value: 'other', label: 'Andere' }
] as const

export const LOT_STATUS = [
  { value: 'contracted', label: 'Kontrahiert' },
  { value: 'price_fixed', label: 'Preis fixiert' },
  { value: 'at_port', label: 'Im Hafen' },
  { value: 'at_production_wh', label: 'Im Produktionslager' },
  { value: 'produced', label: 'Produziert' },
  { value: 'closed', label: 'Abgeschlossen' }
] as const

export const WAREHOUSE_TYPES = [
  { value: 'in_transit', label: 'Unterwegs / Verschifft' },
  { value: 'port', label: 'Hafen' },
  { value: 'production', label: 'Lager Produktion' },
  { value: 'finished', label: 'Fertigwarenlager' },
  { value: 'delivered', label: 'Ausgeliefert' }
] as const

export const COFFEE_SPECIES = [
  { value: 'arabica', label: 'Arabica' },
  { value: 'robusta', label: 'Robusta' },
  { value: 'other', label: 'Andere' }
] as const

// ICE: KC (Mar,May,Jul,Sep,Dec) / RC (Jan,Mar,May,Jul,Sep,Nov)
export const MONTHS_KC = [
  { code:'H', label:'Mar' }, { code:'K', label:'May' }, { code:'N', label:'Jul' },
  { code:'U', label:'Sep' }, { code:'Z', label:'Dec' },
]
export const MONTHS_RC = [
  { code:'F', label:'Jan' }, { code:'H', label:'Mar' }, { code:'K', label:'May' },
  { code:'N', label:'Jul' }, { code:'U', label:'Sep' }, { code:'X', label:'Nov' },
]

// Länder (FAO/ICO – Produzenten; Liste ist bewusst großzügig und erweiterbar)
export const COFFEE_COUNTRIES = [
  'Äthiopien','Angola','Bolivien','Brasilien','Burundi','China','Costa Rica','Dominikanische Republik',
  'DR Kongo','Ecuador','El Salvador','Elfenbeinküste','Guatemala','Guinea','Haiti','Honduras','Indien',
  'Indonesien','Jamaika','Jemen','Kamerun','Kenia','Kolumbien','Kongo (Rep.)','Laos','Madagaskar',
  'Malawi','Malaysia','Mexiko','Myanmar','Nicaragua','Nigeria','Panama','Papua-Neuguinea','Paraguay',
  'Peru','Philippinen','Ruanda','Sambia','Sao Tomé und Príncipe','Sierra Leone','Simbabwe','Sri Lanka',
  'Sudan','Tansania','Thailand','Togo','Timor-Leste','Uganda','USA (Hawaii, Puerto Rico)','Venezuela',
  'Vietnam','Zentralafrikanische Republik'
  // (+ optional weitere sehr kleine Produzenten nach Bedarf ergänzen)
]
