import express from 'express';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticate);

// ————————————————————————————————————————————————
// Base de artigos estruturada para busca e IA
// ————————————————————————————————————————————————
export const ARTICLES = {
  104: {
    numero: 104,
    natureza: 'LEVE',
    titulo: 'Faltas Leves',
    incisos: [
      { num: 'I', texto: 'Entrar ou sair de forma sem a devida permissão.' },
      { num: 'II', texto: 'Chegar atrasado a qualquer aula, formatura, instrução ou a qualquer atividade programada, sem motivo justificável.' },
      { num: 'III', texto: 'Transitar ou fazer uso de vias de acesso ou locais não permitidos ao corpo de estudante.' },
      { num: 'IV', texto: 'Ingressar nas salas ou seções do CMTO sem pedir permissão.' },
      { num: 'V', texto: 'Concorrer para a discórdia, desarmonia e inimizade entre os colegas.' },
      { num: 'VI', texto: 'Desacreditar ou desconsiderar colegas por atos ou palavras.' },
      { num: 'VII', texto: 'Deixar de comunicar a execução de qualquer ordem à autoridade competente.' },
      { num: 'VIII', texto: 'Concorrer para o retardo ou não cumprimento de qualquer ordem de autoridade competente.' },
      { num: 'IX', texto: 'Usar acessório com tamanhos, cores ou formatos esdrúxulos em desacordo com as normas do CMTO.' },
      { num: 'X', texto: 'Usar adereços ou acessórios não permitidos no corpo ou uniforme/farda (bonés, chapéus, boinas, pulseiras, anéis, cordões, fivelas, braceletes, tornozeleiras, lenços, tiaras, dois ou mais brincos, alargadores, entre outros).' },
      { num: 'XI', texto: 'Utilizar-se em sala, instrução ou nas dependências do CMTO de qualquer publicação estranha à atividade escolar.' },
      { num: 'XII', texto: 'Desrespeitar as convenções sociais ou portar-se sem compostura em lugar público.' },
      { num: 'XIII', texto: 'Mascar chiclete ou similares nas dependências do CMTO ou quando uniformizado/fardado.' },
      { num: 'XIV', texto: 'Fazer marcações nas peças do uniforme interno ou remodelá-lo.' },
      { num: 'XV', texto: 'Utilizar calçados com salto alto, plataformas, anabelas e outros do gênero.' },
      { num: 'XVI', texto: 'Deixar de cumprir quaisquer orientações, atribuições, obrigações ou princípios que regem a escola.' },
    ],
  },
  105: {
    numero: 105,
    natureza: 'MEDIA',
    titulo: 'Faltas Médias',
    incisos: [
      { num: 'I', texto: 'Praticar esportes ou qualquer outra atividade em locais e horários inadequados.' },
      { num: 'II', texto: 'Deixar de cortar o cabelo e o pé do cabelo conforme estipulado.' },
      { num: 'III', texto: 'Deixar as unhas grandes ou pintá-las com cores escuras ou extravagantes.' },
      { num: 'IV', texto: 'Fazer uso de pinturas ou maquiagens com tonalidades fortes ou em quantidade excessiva quando devidamente uniformizado/fardado.' },
      { num: 'V', texto: 'Deixar de prender o cabelo conforme estipulado ou fazê-lo relaxadamente.' },
      { num: 'VI', texto: 'Usar tinturas de cabelo de cores extravagantes.' },
      { num: 'VII', texto: 'Usar franjas ou topetes.' },
      { num: 'VIII', texto: 'Deixar de comunicar formalmente à secretaria, coordenações e serviço de orientação educacional do colégio a mudança de endereço, telefone ou qualquer alteração em sua ficha individual.' },
      { num: 'IX', texto: 'Continuar fora da sala de aula ou permanecer na porta após o término do intervalo ou na transição de professores.' },
      { num: 'X', texto: 'Abandonar objetos de ensino e instrução ou peças de uniforme.' },
      { num: 'XI', texto: 'Apresentar-se dentro ou fora da escola, quando uniformizado/fardado, com calçados fora do padrão estabelecido.' },
      { num: 'XII', texto: 'Apresentar-se dentro ou fora da escola, quando uniformizado/fardado, com meia ou meia calça fora do padrão estabelecido.' },
      { num: 'XIII', texto: 'Apresentar-se dentro ou fora da escola, quando uniformizado/fardado, sem a devida identificação do estudante ou da série que cursa, bem como a utilizando de forma irregular.' },
      { num: 'XIV', texto: 'Apresentar-se dentro ou fora da escola, quando uniformizado/fardado, com qualquer peça do uniforme sujo ou amarrotado.' },
      { num: 'XV', texto: 'Apresentar-se dentro da escola com roupas e vestimentas inadequadas ou não permitidas às quais não fazem parte dos uniformes ou fardamentos estabelecidos pela escola.' },
      { num: 'XVI', texto: 'Utilizar indevidamente no uniforme ou fardamento distintivos ou insígnias.' },
      { num: 'XVII', texto: 'Apresentar-se dentro ou fora da escola, quando uniformizado/fardado, sem a respectiva cobertura, boina ou bibico, conforme o caso.' },
      { num: 'XVIII', texto: 'Apresentar-se com distintivos, divisas, fardamentos, uniformes, braçais, manicacas ou qualquer outra identificação que não sejam as suas.' },
      { num: 'XIX', texto: 'Causar ou contribuir para a ocorrência de acidentes ou danos contra as pessoas ou ao patrimônio público.' },
      { num: 'XX', texto: 'Contribuir para a má apresentação da sala de aula ou de qualquer ambiente do colégio por meio de atitudes que ferem as normas de higiene e organização.' },
      { num: 'XXI', texto: 'Deixar de prestar o cumprimento regulamentar aos superiores hierárquicos ou fazê-lo relaxadamente.' },
      { num: 'XXII', texto: 'Deixar de manter a devida compostura quando devidamente uniformizado/fardado.' },
      { num: 'XXIII', texto: 'Deslocar de forma desorganizada quando em atividade ou instrução.' },
      { num: 'XXIV', texto: 'Dormir em sala de aula, durante o horário das aulas.' },
      { num: 'XXV', texto: 'Executar sirenes, toques ou sinais regulamentares, sem ordem para tal.' },
      { num: 'XXVI', texto: 'Faltar a qualquer aula, formatura, instrução ou a qualquer atividade programada, sem motivo justificável.' },
      { num: 'XXVII', texto: 'Incitar colegas a transgredir as normas de convivência escolar.' },
      { num: 'XXVIII', texto: 'Não se apresentar ao superior hierárquico ou retirar-se de sua presença em desobediência às normas regulamentares.' },
      { num: 'XXIX', texto: 'Perambular pelas dependências do colégio ou pelas ruas durante o horário de aula.' },
      { num: 'XXX', texto: 'Proferir palavras de gírias com termos baixos, incompatíveis com as normas de boa educação ou grafá-las em qualquer lugar.' },
      { num: 'XXXI', texto: 'Propor ou aceitar transação pecuniária de qualquer natureza, no interior do colégio, sem a devida autorização.' },
      { num: 'XXXII', texto: 'Praticar ou promover jogos, eventos, apostas, excursões, coletas, listas de pedidos ou campanhas de qualquer natureza, sem a prévia autorização.' },
      { num: 'XXXIII', texto: 'Ter pouco cuidado com o asseio próprio (apresentação pessoal), em qualquer circunstância.' },
      { num: 'XXXIV', texto: 'Retirar qualquer peça do uniforme e ficar desfalcado em sala de aula ou em qualquer local do CMTO ou durante as atividades, sem a devida permissão.' },
      { num: 'XXXV', texto: 'Trocar de uniforme em locais não apropriados.' },
      { num: 'XXXVI', texto: 'Usar piercing ou similares em qualquer parte do corpo.' },
      { num: 'XXXVII', texto: 'Usar os armários nos horários de aula.' },
      { num: 'XXXVIII', texto: 'Deixar de devolver às Coordenações do CMTO dentro do prazo estipulado, documentos devidamente assinados pelos pais ou responsáveis ou qualquer material cautelado.' },
      { num: 'XXXIX', texto: 'Espalhar boatos ou falsas notícias que atentem contra a ordem e a imagem do colégio.' },
      { num: 'XL', texto: 'Fazer uso de costeleta estendida, barba, cavanhaque ou bigode ou sobrancelha fora do padrão regulamentado pelo CMTO.' },
      { num: 'XLI', texto: 'Repetir alimentação servida no colégio sem a devida autorização.' },
      { num: 'XLII', texto: 'Desrespeitar formação de filas ou disposições pré-estabelecidas pela escola.' },
      { num: 'XLIII', texto: 'Alimentar-se em locais ou horários impróprios.' },
      { num: 'XLIV', texto: 'Apresentar-se dentro ou fora da escola, quando uniformizado/fardado, com camiseta ou gandola para fora do uniforme, bem como a utilizando de forma irregular.' },
      { num: 'XLV', texto: 'Deixar de apresentar quando solicitado pelo professor ou militar qualquer material ou atividade de cunho disciplinar e pedagógico.' },
      { num: 'XLVI', texto: 'Deixar o estudante de cumprir quaisquer orientações, atribuições, obrigações ou princípios que regem o CMTO, considerado de natureza média.' },
      { num: 'XLVII', texto: 'Apresentar parte ou recursos sem seguir as normas e preceitos regulamentares, em termos desrespeitosos, com argumentos falsos ou de má fé, ou mesmo sem justa causa ou razão.' },
    ],
  },
  106: {
    numero: 106,
    natureza: 'GRAVE',
    titulo: 'Faltas Graves',
    incisos: [
      { num: 'I', texto: 'Assinar pelo pai ou responsável documento que deva ser destinado ao colégio.' },
      { num: 'II', texto: 'Atentar contra a integridade física de qualquer pessoa.' },
      { num: 'III', texto: 'Agredir verbalmente com palavras, uso de gírias, termos de baixo calão ou gestos, militares, professores, coordenadores, funcionários ou qualquer pessoal do CMTO.' },
      { num: 'IV', texto: 'Faltar com a verdade.' },
      { num: 'V', texto: 'Utilizar-se do anonimato.' },
      { num: 'VI', texto: 'Censurar ou criticar ato de superior ou procurar desconsiderá-lo, seja entre militares ou civis.' },
      { num: 'VII', texto: 'Deixar de cumprir qualquer punição.' },
      { num: 'VIII', texto: 'Desacatar a autoridade de professores, de funcionários ou da Gestão do CMTO.' },
      { num: 'IX', texto: 'Dirigir-se, referir-se ou responder ao superior hierárquico de modo desrespeitoso ou desatencioso.' },
      { num: 'X', texto: 'Discutir ou provocar discussões por qualquer veículo de comunicação sobre assuntos de natureza política ou militar.' },
      { num: 'XI', texto: 'Esquivar-se a satisfazer compromissos de ordem moral ou pecuniária que houver assumido.' },
      { num: 'XII', texto: 'Frequentar lugares incompatíveis com o decoro da sociedade e de sua situação de estudante.' },
      { num: 'XIII', texto: 'Fumar no ambiente interno do CMTO ou fora dele estando uniformizado/fardado.' },
      { num: 'XIV', texto: 'Ter em seu poder ou ingerir bebidas alcoólicas.' },
      { num: 'XV', texto: 'Guiar ou dirigir veículo sem estar devidamente habilitado pelo órgão competente, quando fardado/uniformizado.' },
      { num: 'XVI', texto: 'Içar ou arriar a bandeira ou estandarte sem ordem para tal.' },
      { num: 'XVII', texto: 'Namorar ou trocar carícias no ambiente do colégio e fora dele, quando estiverem uniformizados/fardados.' },
      { num: 'XVIII', texto: 'Manter contato físico com denotação libidinosa no ambiente do CMTO ou mesmo fora dele, quando estiverem uniformizado/fardado.' },
      { num: 'XIX', texto: 'Não zelar devidamente, danificar ou extraviar, por negligência ou desobediência às regras ou normas do CMTO, material do CMTO ou de colegas.' },
      { num: 'XX', texto: 'Ofender a moral e os bons costumes.' },
      { num: 'XXI', texto: 'Praticar atos contrários ao culto e respeito aos Símbolos Nacionais.' },
      { num: 'XXII', texto: 'Representar o colégio ou por ele tomar compromisso sem estar para isso autorizado.' },
      { num: 'XXIII', texto: 'Retirar, rasurar ou falsificar documentos escolares ou assinaturas.' },
      { num: 'XXIV', texto: 'Esquivar-se ao atendimento das obrigações e atividades escolares sob a alegação de doença, não comprovada por documento fornecido por profissional de saúde.' },
      { num: 'XXV', texto: 'Ter em seu poder, introduzir, ler ou distribuir dentro do CMTO publicações, estampas ou jornais subversivos ou que atentem contra a disciplina ou a moral.' },
      { num: 'XXVI', texto: 'Fazer atividades ou trabalhos que não sejam o da aula ministrada, sem a devida autorização.' },
      { num: 'XXVII', texto: 'Retirar ou tentar retirar objetos de qualquer dependência do colégio, ou mesmo deles servir-se, sem ordem do responsável ou do proprietário.' },
      { num: 'XXVIII', texto: 'Participar de manifestação coletiva, estando uniformizado/fardado, contrário às normas do colégio, dentro ou fora do CMTO.' },
      { num: 'XXIX', texto: 'Travar disputa, rixa ou luta corporal.' },
      { num: 'XXX', texto: 'Ter atitudes ou relações de comportamento incompatíveis com o padrão do CMTO.' },
      { num: 'XXXI', texto: 'Entrar ou permanecer em sala de aula ou qualquer ambiente de instrução diverso.' },
      { num: 'XXXII', texto: 'Entrar ou sair do CMTO sem a devida autorização.' },
      { num: 'XXXIII', texto: 'Fazer algazarra ou brincadeiras em ocasiões ou lugares impróprios.' },
      { num: 'XXXIV', texto: 'Conservar em seu poder, fazer uso ou realizar carga de bateria de aparelhos de vídeo, áudio, telefônico ou qualquer material estranho à atividade escolar, quando em instrução ou nas dependências da escola, inclusive no horário de almoço, lanche e horários vagos.' },
      { num: 'XXXV', texto: 'Perturbar o estudo dos colegas com barulho ou conversas paralelas.' },
      { num: 'XXXVI', texto: 'Fazer ou provocar excessivo barulho em qualquer dependência do colégio.' },
      { num: 'XXXVII', texto: 'Apresentar-se com o uniforme alterado ou diferente do estabelecido para a data ou atividade.' },
      { num: 'XXXVIII', texto: 'Faltar à Chamada Geral ou a qualquer formatura, sem motivo justificável.' },
      { num: 'XXXIX', texto: 'Danificar ou extraviar quaisquer objetos pessoais de outros colegas ou de qualquer membro do colégio.' },
      { num: 'XL', texto: 'Fazer uso de qualquer alimento não permitido ou em desacordo com as normas estipuladas.' },
      { num: 'XLI', texto: 'Retirar-se de atividades de ensino ou instrução sem a devida autorização.' },
      { num: 'XLII', texto: 'Tomar atitudes que afetem o bom nome do colégio realizado em âmbito externo que venham ao conhecimento do Corpo Discente.' },
      { num: 'XLIII', texto: 'Ofender alguém, dentro ou fora da escola, com palavras de baixo calão.' },
      { num: 'XLIV', texto: 'Descumprir as determinações, atribuições e deveres inerentes ao estudante suspenso.' },
      { num: 'XLV', texto: 'Fazer uso de apelidos sem autorização do ofendido.' },
      { num: 'XLVI', texto: 'Expor colegas, professores ou funcionários a situações vexatórias.' },
      { num: 'XLVII', texto: 'Publicar ou circular fisicamente ou nas redes sociais informação que contrariem as normas éticas e morais.' },
      { num: 'XLVIII', texto: 'Deixar o estudante de cumprir quaisquer orientações, atribuições, obrigações ou princípios que regem a escola, considerado de natureza grave.' },
      { num: 'XLIX', texto: 'Fazer uso de telefone celular e/ou aparelhos eletrônicos nas atividades escolares, nas instruções ou em formaturas, sem prévia autorização.' },
      { num: 'L', texto: 'Filmar e/ou fotografar atividades do colégio sem a devida autorização, bem como publicar ou contribuir para que sejam publicadas mensagens, fotos ou qualquer outro documento, na internet, aplicativos de mensagens, ou em redes sociais.' },
      { num: 'LI', texto: 'Fazer uso de tecnologias da informação e comunicação para dar apoio a comportamentos deliberados, repetidos e hostis para prejudicar outrem (cyberbullying).' },
    ],
  },
  107: {
    numero: 107,
    natureza: 'GRAVISSIMO',
    titulo: 'Faltas Gravíssimas/Eliminatórias',
    incisos: [
      { num: 'I', texto: 'Ter se valido ou tentado utilizar-se de meios ilícitos e/ou fraudulentos para resolução de provas ou trabalhos escolares (cola/fraude em provas).' },
      { num: 'II', texto: 'Participar de greves e movimentos reivindicatórios estando uniformizado ou fardado.' },
      { num: 'III', texto: 'Portar, traficar, consumir, incitar ou acobertar o uso de drogas de qualquer natureza ou delas fazer uso dentro ou fora do CMTO.' },
      { num: 'IV', texto: 'Destruir ou danificar, deliberadamente, com requintes de vandalismo, instalações, equipamentos ou materiais pertencentes ao patrimônio público.' },
      { num: 'V', texto: 'Modificar, invadir, inserir, excluir ou alterar, indevidamente, o estudante, sistema de informações, banco de dados ou programa de informática ou qualquer material de cunho pedagógico ou disciplinar sem autorização ou solicitação de autoridade competente.' },
      { num: 'VI', texto: 'Apropriar-se, indevidamente, de dinheiro, valor ou qualquer outro bem móvel, público ou particular, ou desviá-lo, em proveito próprio ou alheio (furto/roubo).' },
      { num: 'VII', texto: 'Portar, fornecer, receber, ter em depósito, transportar, ceder, emprestar, remeter, empregar, manter sob guarda ou ocultar arma branca, arma de fogo, simulacro, acessório ou munição.' },
      { num: 'VIII', texto: 'Ser condenado em processo por prática de transgressão ou crime de qualquer natureza.' },
      { num: 'IX', texto: 'Cometer qualquer tipo de ato que afete gravemente à honra, a moral, o pudor e o decoro sociais.' },
      { num: 'X', texto: 'Cometer, dentro ou fora do CMTO, qualquer tipo de assédio contra alguém.' },
      { num: 'XI', texto: 'Constranger, ofender, intimidar, perseguir ou coagir a outrem, dentro ou fora do CMTO, por meio de palavras impróprias, piadas, brincadeiras ou quaisquer atividades que atentem outros em sua honra, moral, equilíbrio emocional e/ou psicológico e integridade física (Bullying).' },
    ],
  },
};

// ——————————————————————————————————————————————————————————
// Recomendação local por similaridade de texto (sem API externa)
// ——————————————————————————————————————————————————————————

const STOPWORDS = new Set([
  'de','da','do','das','dos','em','na','no','nas','nos','por','para','com',
  'sem','sob','sobre','entre','ate','apos','ante','perante','o','a','os','as',
  'um','uma','uns','umas','e','ou','mas','se','que','como','quando','onde',
  'quem','qual','quais','este','esta','esse','essa','esses','essas','aquele',
  'aquela','aqueles','aquelas','isso','isto','aquilo','seu','sua','seus','suas',
  'meu','minha','meus','minhas','lhe','lhes','ao','aos','nao','foi','ser',
  'ter','mais','muito','bem','ja','tambem','so','qualquer','todo','toda',
  'todos','todas','cada','algum','alguma','alguns','algumas','nenhum','nenhuma',
  'mesmo','proprio','propria','ha','vai','tem','sao','estar','ficou','fica',
  'faz','fazer','feito','pode','pois','pra','pelo','pela','pelos','pelas',
  'num','numa','foi','era','sendo','tendo','quando','dentro','fora','qualquer',
]);

function normalizar(texto) {
  return texto
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOPWORDS.has(w));
}

function calcularScore(descTokens, incisoTokens) {
  if (!descTokens.length || !incisoTokens.length) return 0;
  const incisoSet = new Set(incisoTokens);
  let hits = 0;
  for (const w of descTokens) {
    if (incisoSet.has(w)) {
      hits += 1;
    } else if (w.length >= 5) {
      // correspondência por radical (primeiros 5 caracteres)
      for (const iw of incisoSet) {
        if (iw.length >= 5 && (w.startsWith(iw.slice(0, 5)) || iw.startsWith(w.slice(0, 5)))) {
          hits += 0.6;
          break;
        }
      }
    }
  }
  return hits / descTokens.length;
}

const ORDEM_NATUREZA = { GRAVISSIMO: 3, GRAVE: 2, MEDIA: 1, LEVE: 0 };

function recomendarArtigos(descricao) {
  const descTokens = normalizar(descricao);
  const candidatos = [];

  for (const art of Object.values(ARTICLES)) {
    for (const inciso of art.incisos) {
      const incisoTokens = normalizar(inciso.texto);
      const score = calcularScore(descTokens, incisoTokens);
      if (score >= 0.08) {
        candidatos.push({ artigo: art.numero, inciso: inciso.num, natureza: art.natureza, texto: inciso.texto, _score: score });
      }
    }
  }

  candidatos.sort((a, b) => b._score - a._score);
  const top3 = candidatos.slice(0, 3);

  if (!top3.length) return { recomendacoes: [], naturezaSugerida: null };

  const maxScore = top3[0]._score;
  const recomendacoes = top3.map(({ _score, ...c }) => {
    const ratio = _score / maxScore;
    const relevancia = ratio >= 0.75 ? 'ALTA' : ratio >= 0.4 ? 'MEDIA' : 'BAIXA';
    const palavrasChave = normalizar(c.texto).filter(w => normalizar(descricao).includes(w)).slice(0, 3);
    const justificativa = palavrasChave.length
      ? `Correspondência com: ${palavrasChave.join(', ')}.`
      : null;
    return { ...c, relevancia, justificativa };
  });

  const naturezaSugerida = recomendacoes.reduce(
    (max, r) => ORDEM_NATUREZA[r.natureza] > ORDEM_NATUREZA[max] ? r.natureza : max,
    recomendacoes[0].natureza
  );

  return { recomendacoes, naturezaSugerida };
}

// ——— Endpoint de recomendação (busca local) ———
router.post('/recommend-article', (req, res, next) => {
  try {
    const { descricao } = req.body;
    if (!descricao || descricao.trim().length < 5) {
      return res.status(400).json({ error: 'Descrição muito curta' });
    }
    res.json(recomendarArtigos(descricao.trim()));
  } catch (err) { next(err); }
});

// ——— Endpoint para listar todos os artigos (para consulta no frontend) ———
router.get('/articles', (req, res) => {
  res.json(ARTICLES);
});

export default router;
