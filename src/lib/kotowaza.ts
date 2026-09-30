// Provérbios japoneses (ことわざ) — um por dia.

export interface Kotowaza {
  jp: string;
  romaji: string;
  pt: string;
}

export const KOTOWAZA: Kotowaza[] = [
  { jp: "七転び八起き", romaji: "nana korobi ya oki", pt: "Caia sete vezes, levante-se oito." },
  { jp: "継続は力なり", romaji: "keizoku wa chikara nari", pt: "A persistência é poder." },
  { jp: "塵も積もれば山となる", romaji: "chiri mo tsumoreba yama to naru", pt: "Até a poeira, acumulada, vira montanha." },
  { jp: "猿も木から落ちる", romaji: "saru mo ki kara ochiru", pt: "Até macacos caem das árvores. (Todo mundo erra — até em produção.)" },
  { jp: "急がば回れ", romaji: "isogaba maware", pt: "Se tem pressa, dê a volta. (Faça direito da primeira vez.)" },
  { jp: "石の上にも三年", romaji: "ishi no ue ni mo sannen", pt: "Três anos sobre uma pedra (e ela esquenta). Paciência vence." },
  { jp: "千里の道も一歩から", romaji: "senri no michi mo ippo kara", pt: "Uma jornada de mil ri começa com um passo." },
  { jp: "一期一会", romaji: "ichigo ichie", pt: "Uma vez, um encontro. Cada momento é único." },
  { jp: "花より団子", romaji: "hana yori dango", pt: "Dango em vez de flores. (O prático acima do bonito.)" },
  { jp: "出る杭は打たれる", romaji: "deru kui wa utareru", pt: "O prego que se destaca leva martelada." },
  { jp: "井の中の蛙大海を知らず", romaji: "i no naka no kawazu taikai wo shirazu", pt: "O sapo no poço não conhece o oceano. Continue aprendendo." },
  { jp: "善は急げ", romaji: "zen wa isoge", pt: "Faça o bem depressa. (Não deixe pra depois.)" },
  { jp: "案ずるより産むが易し", romaji: "anzuru yori umu ga yasushi", pt: "Fazer é mais fácil do que se preocupar." },
  { jp: "雨降って地固まる", romaji: "ame futte ji katamaru", pt: "Depois da chuva, a terra fica firme." },
  { jp: "郷に入っては郷に従え", romaji: "gō ni itte wa gō ni shitagae", pt: "Na aldeia, siga a aldeia. (Respeite o estilo do código.)" },
  { jp: "初心忘るべからず", romaji: "shoshin wasuru bekarazu", pt: "Nunca esqueça a mente de principiante." },
  { jp: "一石二鳥", romaji: "isseki nichō", pt: "Uma pedra, dois pássaros." },
  { jp: "十人十色", romaji: "jūnin toiro", pt: "Dez pessoas, dez cores. Cada cliente é um cliente." },
  { jp: "三人寄れば文殊の知恵", romaji: "sannin yoreba monju no chie", pt: "Três cabeças juntas têm a sabedoria de Monju. (Code review!)" },
  { jp: "知らぬが仏", romaji: "shiranu ga hotoke", pt: "Não saber é ser Buda. (…até abrir os logs.)" },
  { jp: "備えあれば憂いなし", romaji: "sonae areba urei nashi", pt: "Quem se prepara não se preocupa. (Faça backup.)" },
  { jp: "習うより慣れろ", romaji: "narau yori narero", pt: "Mais que estudar, pratique." },
  { jp: "能ある鷹は爪を隠す", romaji: "nō aru taka wa tsume wo kakusu", pt: "O falcão habilidoso esconde as garras." },
  { jp: "鉄は熱いうちに打て", romaji: "tetsu wa atsui uchi ni ute", pt: "Malhe o ferro enquanto está quente." },
  { jp: "頭隠して尻隠さず", romaji: "atama kakushite shiri kakusazu", pt: "Esconde a cabeça e deixa o rabo de fora. (Tratou o erro só no front?)" },
  { jp: "時は金なり", romaji: "toki wa kane nari", pt: "Tempo é dinheiro." },
  { jp: "笑う門には福来る", romaji: "warau kado ni wa fuku kitaru", pt: "A sorte entra pela porta de quem sorri." },
  { jp: "失敗は成功のもと", romaji: "shippai wa seikō no moto", pt: "O fracasso é a origem do sucesso." },
  { jp: "百聞は一見に如かず", romaji: "hyakubun wa ikken ni shikazu", pt: "Ver uma vez vale mais que ouvir cem. (Reproduza o bug.)" },
  { jp: "縁の下の力持ち", romaji: "en no shita no chikaramochi", pt: "O forte debaixo do assoalho. (Salve, back-end.)" },
];

export function kotowazaOfDay(date = new Date()): Kotowaza {
  const start = new Date(date.getFullYear(), 0, 0);
  const day = Math.floor((date.getTime() - start.getTime()) / 86400_000);
  return KOTOWAZA[(day + date.getFullYear()) % KOTOWAZA.length];
}
