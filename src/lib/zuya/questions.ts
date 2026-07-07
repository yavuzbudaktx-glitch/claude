// One question a day; both answer blind, revealed together. A bold mix —
// spicy, funny, this-or-that debate, and blunt real talk. No greeting-card
// energy. Append freely; past days keep their question via question_idx.

export interface ZuyaQuestion {
  en: string;
  tr: string;
}

export const ZUYA_QUESTIONS: ZuyaQuestion[] = [
  { en: "Something you want to try in bed but haven't said?", tr: "Yatakta denemek isteyip söylemediğin şey ne?" },
  { en: "Most embarrassing thing you've done because of me?", tr: "Benim yüzümden yaptığın en utanç verici şey ne?" },
  { en: "Next trip — beach or mountains? Defend it.", tr: "Sıradaki tatil — deniz mi dağ mı? Savun." },
  { en: "What do you want from me that you feel stupid asking for?", tr: "Benden isteyip de istemeye çekindiğin şey ne?" },
  { en: "Where do you most want to be kissed?", tr: "En çok nereden öpülmek istiyorsun?" },
  { en: "If I were an animal, which one — and why?", tr: "Hayvan olsam hangisi olurdum, neden?" },
  { en: "Big wedding or run off and elope — pick.", tr: "Büyük düğün mü, kaçıp evlenmek mi — seç." },
  { en: "When did I last hurt you without noticing?", tr: "En son ne zaman farkında olmadan seni kırdım?" },
  { en: "What outfit of mine drives you crazy?", tr: "Hangi kıyafetim seni delirtiyor?" },
  { en: "My most annoying habit — be honest.", tr: "En sinir bozucu huyum ne — dürüst ol." },
  { en: "Morning or midnight — when do you want me more?", tr: "Sabah mı gece yarısı mı — beni ne zaman daha çok istiyorsun?" },
  { en: "What are you a little scared to tell me?", tr: "Bana söylemekten biraz korktuğun şey ne?" },
  { en: "Describe our best night in three words.", tr: "En iyi gecemizi üç kelimeyle anlat." },
  { en: "One thing I say you'd love to mute?", tr: "Söylediğim, susturmak istediğin bir şey ne?" },
  { en: "Cats or kids first?", tr: "Önce kedi mi, çocuk mu?" },
  { en: "What do you need more of from me this week?", tr: "Bu hafta benden daha çok neye ihtiyacın var?" },
  { en: "A fantasy you'd actually want to make real?", tr: "Gerçekten gerçekleştirmek istediğin bir fantezin ne?" },
  { en: "Rate my cooking 1–10 and lie a little.", tr: "Yemeğime 10 üzerinden puan ver, biraz da yalan söyle." },
  { en: "Rich and busy, or comfortable and free?", tr: "Zengin ve meşgul mü, rahat ve özgür mü?" },
  { en: "Something you gave up for us?", tr: "Bizim için vazgeçtiğin şey ne?" },
  { en: "Lights on or off?", tr: "Işıklar açık mı kapalı mı?" },
  { en: "Write my dating profile — honestly.", tr: "Flört profilimi yaz — dürüstçe." },
  { en: "Loud fight or silent treatment — which are you?", tr: "Bağırarak kavga mı, küsmek mi — sen hangisisin?" },
  { en: "What makes you feel wanted, not just loved?", tr: "Sevilmek değil, istenmek sana neyle hissettiriliyor?" },
  { en: "Hottest thing I've ever done?", tr: "Yaptığım en seksi şey neydi?" },
  { en: "City life or a house with a dog?", tr: "Şehir hayatı mı, köpekli bir ev mi?" },
  { en: "When do you feel closest to me?", tr: "Bana en yakın ne zaman hissediyorsun?" },
  { en: "What do you think about when you miss me at night?", tr: "Gece beni özleyince ne düşünüyorsun?" },
  { en: "A nickname for me you'd never say out loud?", tr: "Bana taktığın, sesli söylemeyeceğin bir lakap?" },
  { en: "Plan everything or wing it?", tr: "Her şeyi planlamak mı, akışına bırakmak mı?" },
  { en: "A promise you want me to keep?", tr: "Tutmamı istediğin bir söz ne?" },
  { en: "Whose place tonight — and what happens?", tr: "Bu gece kimin evi — ve ne oluyor?" },
  { en: "1M lira lands right now — first dumb purchase?", tr: "Şu an 1 milyon gelse, ilk salak harcaman ne?" },
  { en: "Text all day or one long call?", tr: "Gün boyu mesaj mı, bir uzun arama mı?" },
  { en: "What do you wish I understood about you?", tr: "Seninle ilgili anlamamı istediğin şey ne?" },
  { en: "Slow and teasing, or fast and rough?", tr: "Yavaş ve kışkırtıcı mı, hızlı ve sert mi?" },
  { en: "The worst gift I could possibly give you?", tr: "Sana verebileceğim en kötü hediye ne?" },
  { en: "What are we avoiding talking about?", tr: "Konuşmaktan kaçındığımız şey ne?" },
  { en: "One place we haven't but should?", tr: "Yapmadığımız ama denememiz gereken bir yer?" },
  { en: "Describe me to a stranger in one savage sentence.", tr: "Beni bir yabancıya tek acımasız cümleyle anlat." },
  { en: "Same career forever, or restart at zero together?", tr: "Hep aynı kariyer mi, birlikte sıfırdan başlamak mı?" },
  { en: "What do you need to hear from me tonight?", tr: "Bu gece benden ne duyman lazım?" },
  { en: "A turn-on you'd never admit in daylight?", tr: "Gündüz asla itiraf etmeyeceğin, seni tahrik eden şey?" },
  { en: "If I ghosted you for a day — your revenge?", tr: "Bir gün seni görmezden gelsem, intikamın ne olur?" },
  { en: "Marry young, or live together for years first?", tr: "Genç evlenmek mi, önce yıllarca yaşamak mı?" },
  { en: "The realest thing you feel about us right now?", tr: "Şu an bizimle ilgili hissettiğin en gerçek şey ne?" },
  { en: "Show or tell — how do you want to be wanted?", tr: "Göstermek mi, söylemek mi — nasıl istenmek istiyorsun?" },
  { en: "My dumbest opinion that you tolerate?", tr: "Katlandığın en salak fikrim ne?" },
  { en: "What would make tonight unforgettable?", tr: "Bu geceyi ne unutulmaz yapardı?" },
  { en: "One thing you'd change about me — and one you never would.", tr: "Bende değiştireceğin bir şey — ve asla değiştirmeyeceğin bir şey." },
];

// The spicier deck — behind the 🌶️ button. Adult but tasteful.
export const ZUYA_SPICY_QUESTIONS: ZuyaQuestion[] = [
  { en: "Boldest place you'd want to be alone with me?", tr: "Benimle yalnız kalmak isteyeceğin en cesur yer neresi?" },
  { en: "Something you've fantasized about but never told me?", tr: "Hayalini kurup bana hiç söylemediğin şey ne?" },
  { en: "What do I wear that you can't stop thinking about?", tr: "Giydiğimde aklından çıkaramadığın şey ne?" },
  { en: "Describe our perfect night with the door locked.", tr: "Kapı kilitliyken geçireceğimiz mükemmel geceyi anlat." },
  { en: "A touch you want more of?", tr: "Daha fazlasını istediğin bir dokunuş ne?" },
  { en: "One thing you'd love me to do slower?", tr: "Daha yavaş yapmamı istediğin bir şey ne?" },
  { en: "A word or whisper that gets to you every time?", tr: "Her seferinde sana işleyen bir kelime ya da fısıltı ne?" },
  { en: "If I walked in right now, first thing you'd do?", tr: "Şu an içeri girsem ilk yapacağın şey ne?" },
  { en: "Lights on or off — and why?", tr: "Işıklar açık mı kapalı mı — neden?" },
  { en: "Which look of mine undoes you?", tr: "Sana bakışlarımdan hangisi seni eritiyor?" },
  { en: "Where do you daydream about kissing me?", tr: "Seni nerede öpmenin hayalini kuruyorsun?" },
  { en: "A fantasy you'd actually want to make real?", tr: "Gerçekleştirmek isteyeceğin bir fantezi ne?" },
  { en: "Morning, midnight, or mid-afternoon — when do you want me most?", tr: "Sabah, gece yarısı ya da öğlen — beni en çok ne zaman istiyorsun?" },
  { en: "Something you want to hear me say more often?", tr: "Daha sık söylememi istediğin şey ne?" },
  { en: "What's the fastest way I get under your skin — the good kind?", tr: "Seni en hızlı etkilemenin yolu ne — iyi anlamda?" },
];

// Spicy questions live at this index offset so a single `question_idx` column
// can point into either deck without a schema change.
export const ZUYA_SPICY_OFFSET = 100000;

export function getZuyaQuestion(idx: number): ZuyaQuestion {
  if (idx >= ZUYA_SPICY_OFFSET) {
    return ZUYA_SPICY_QUESTIONS[idx - ZUYA_SPICY_OFFSET] ?? ZUYA_SPICY_QUESTIONS[0];
  }
  return ZUYA_QUESTIONS[idx] ?? ZUYA_QUESTIONS[0];
}
