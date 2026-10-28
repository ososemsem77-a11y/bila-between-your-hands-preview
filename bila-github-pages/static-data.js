window.BILA_STATIC_MODE = true;
window.BILA_STATIC_BOOTSTRAP = {
  categories: [
    { id: 'health', name: 'الصحة', icon: '✚', color: '#e26f63' },
    { id: 'education', name: 'التعليم', icon: '▤', color: '#6288d7' },
    { id: 'government', name: 'خدمات حكومية', icon: '▥', color: '#d2a74c' },
    { id: 'worship', name: 'دور العبادة', icon: '☾', color: '#9b78cb' },
    { id: 'finance', name: 'الخدمات المالية', icon: '▣', color: '#338b79' },
    { id: 'shopping', name: 'التسوق والتجارة', icon: '▧', color: '#d38543' },
    { id: 'food', name: 'مطاعم وكافيهات', icon: '♨', color: '#cc7252' },
    { id: 'sports', name: 'الشباب والرياضة', icon: '⚽', color: '#5b9b61' },
    { id: 'transport', name: 'المواصلات', icon: '↗', color: '#557f9b' },
    { id: 'auto', name: 'السيارات والخدمات', icon: '⚙', color: '#71808b' },
    { id: 'professional', name: 'خدمات مهنية', icon: '⌁', color: '#8a7461' },
    { id: 'stay', name: 'الإقامة', icon: '⌂', color: '#927c65' },
    { id: 'leisure', name: 'ترفيه وأماكن مفتوحة', icon: '☘', color: '#48977b' },
    { id: 'landmark', name: 'معالم وأماكن مهمة', icon: '⌖', color: '#b4814d' }
  ],
  places: [
    {
      id: 'abu-ghannam-mosque', name: 'مسجد العارف بالله سيدي سالم البيلي أبو غنام',
      category: 'landmark', type: 'معلم تاريخي', zone: 'مدينة بيلا', address: 'مدينة بيلا، محافظة كفر الشيخ',
      description: 'مسجد تاريخي يعود إنشاؤه إلى نحو 700هـ. افتُتح بعد أعمال ترميم في 26 فبراير 2025. الصورة رسم توضيحي وليست صورة فوتوغرافية للمبنى.',
      lat: null, lng: null,
      mapsUrl: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('مسجد أبو غنام، بيلا، كفر الشيخ'),
      source: 'https://kfs.gov.eg/posts/وسط-فرحة-الأهالي-محافظ-كفرالشيخ-يفتتح-مسجد-أبو-غنام-الأثري-ببيلا-مقدماً-التهنئة-لأبناء-المحافظة-بمناسبة-شهر-رمضان-المبارك',
      image: './abu-ghannam.svg', verification: 'verified', status: 'published'
    },
    {
      id: 'egyptian-tax-office-bila', name: 'مأمورية الضرائب المصرية ببيلا',
      category: 'government', type: 'مصلحة حكومية', zone: 'مدينة بيلا', address: 'شارع الجمهورية، بيلا، كفر الشيخ',
      phone: '0473604328', description: 'بيانات العنوان ورقم الهاتف منشورة على صفحة مصلحة الضرائب المصرية. يُفضّل التأكد هاتفيًا قبل التوجه.',
      lat: null, lng: null,
      mapsUrl: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('مأمورية الضرائب المصرية، شارع الجمهورية، بيلا، كفر الشيخ'),
      source: 'https://www.eta.gov.eg/ar/node/1010',
      image: './government-office.svg', verification: 'verified', status: 'published'
    }
  ],
  stats: { visits: 0, searches: 0, mapOpens: 0 },
  city: {
    name: 'بيلا', governorate: 'كفر الشيخ', lat: 31.1728, lng: 31.221,
    mapsUrl: 'https://maps.app.goo.gl/c5wqJjDN22RCpNiFA?g_st=aw'
  }
};
