// Level 1: the files come down and the record is kept, but nothing here turns them into something the
// harness runs yet. Each file is pinned to the commit or revision that was checked.
const fetchable = (id, files) => ({
  id,
  version: 1,
  as: [],
  async fetch(get) { for (const [name, url] of Object.entries(files)) get.save(name, await get.bytes(url)); }
});

export default [
  fetchable('bridge', { 'test.json': 'https://raw.githubusercontent.com/rosewang2008/bridge/a5b1d426ce517e0aeb4b7b2a64e842501c98e38f/dataset/test.json' }),
  fetchable('clear-corpus', { 'CLEAR_corpus_final.xlsx': 'https://github.com/scrosseye/CLEAR-Corpus/raw/dbf1cf0df30bf6be8b0691d2c078b75043ca6199/CLEAR_corpus_final.xlsx' }),
  fetchable('drawedumath', { 'DrawEduMath_QA.csv': 'https://huggingface.co/datasets/Heffernan-WPI-Lab/DrawEduMath/resolve/f79b4a30f397d6b7a02d9ebe9b6c5a9735dfecfd/Data/DrawEduMath_QA.csv' }),
  fetchable('mathfish', {
    'train.jsonl': 'https://huggingface.co/datasets/allenai/mathfish/resolve/7d475ecf785a33823475bce5b5093f0a2e8b2411/train.jsonl',
    'dev.jsonl': 'https://huggingface.co/datasets/allenai/mathfish/resolve/7d475ecf785a33823475bce5b5093f0a2e8b2411/dev.jsonl',
    'test.jsonl': 'https://huggingface.co/datasets/allenai/mathfish/resolve/7d475ecf785a33823475bce5b5093f0a2e8b2411/test.jsonl'
  }),
  fetchable('talkmoves', { 'talkmoves.zip': 'https://github.com/SumnerLab/TalkMoves/archive/869b9406de268ebab0f1b9a3bccde0b416b97290.zip' }),
  fetchable('csta-computer-science-standards', { 'csta-standards.pdf': 'https://csteachers.org/wp-content/uploads/2026/07/2026-CSTA-PK%E2%80%9312-Computer-Science-Standards.pdf' })
];
