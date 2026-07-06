const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

// Load environment variables from backend/.env using absolute path
dotenv.config({ path: '/home/gahz8212/forwarding-hub/backend/.env' });

const knownMakers = ['현대', '기아', '르노삼성', 'KG모빌리티', '쌍용', '쉐보레', 'Chevrolet', 'BMW', '벤츠', '아우디', '폭스바겐', '렉서스', '토요타', 'FORD', 'HONDA', 'Mercedes-Benz'];

function inferMakeFromModel(modelName) {
  if (!modelName) return null;
  const m = modelName.toUpperCase();
  
  const hyundaiModels = ['GRANDEUR', '그랜저', 'AVANTE', '아반떼', 'SONATA', '쏘나타', 'SANTA', '산타페', 'TUCSON', '투싼', 'GENESIS', '제네시스', 'KONA', '코나', 'PALISADE', '팰리세이드', 'IONIQ', '아이오닉', 'VELOSTER', '벨로스터', 'ACCENT', '엑센트', 'STAREX', '스타렉스', 'STARIA', '스타리아'];
  const kiaModels = ['MORNING', '모닝', 'RAY', '레이', 'K3', 'K5', 'K7', 'K9', 'SPORTAGE', '스포티지', 'SORENTO', '쏘렌토', 'CARNIVAL', '카니발', 'SELTOS', '셀토스', 'SOUL', '쏘울', 'PRIDE', '프라이드', 'FORTE', '포르테', 'CEED', '씨드', 'NIRO', '니로', 'MOHAVE', '모하비', 'STINGER', '스팅어'];
  const renaultModels = ['SM3', 'SM5', 'SM6', 'SM7', 'QM3', 'QM5', 'QM6', 'XM3', '르노', 'RENAULT', '삼성'];
  const kgModels = ['TIVOLI', '티볼리', 'KORANDO', '코란도', 'REXTON', '렉스턴', 'TORRES', '토레스', '쌍용', 'SSANGYONG'];
  const chevroletModels = ['SPARK', '스파크', 'AVEO', '아베오', 'CRUZE', '크루즈', 'MALIBU', '말리부', 'IMPOLA', '임팔라', 'TRAX', '트랙스', 'EQUINOX', '이쿼녹스', 'CAPTIVA', '캡티바', 'COLORADO', '콜로라도', 'TAHOE', '타호', 'ORLANDO', '올란도', 'DAMAS', '다마스', 'LABO', '라보'];

  if (hyundaiModels.some(x => m.includes(x))) return '현대';
  if (kiaModels.some(x => m.includes(x))) return '기아';
  if (renaultModels.some(x => m.includes(x))) return '르노삼성';
  if (kgModels.some(x => m.includes(x))) return 'KG모빌리티';
  if (chevroletModels.some(x => m.includes(x))) return '쉐보레';
  
  return null;
}

async function migrate() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  console.log('Connected to MySQL database:', process.env.DB_NAME, 'on port', process.env.DB_PORT);

  const [vehicles] = await connection.query('SELECT id, make, model FROM vehicles');
  console.log(`Checking ${vehicles.length} vehicle records...`);

  let fixCount = 0;
  for (const v of vehicles) {
    const makeVal = v.make ? v.make.trim() : '';
    const modelVal = v.model ? v.model.trim() : '';

    // If make is empty or make is a model name (not in known makers)
    const isMakeIncorrect = makeVal && !knownMakers.includes(makeVal);
    const isModelEmpty = !modelVal || modelVal === 'Unknown';

    if (isMakeIncorrect || (isModelEmpty && makeVal && makeVal !== 'Unknown')) {
      // Swapping and fixing
      const newModel = makeVal; // The incorrect make is actually the model
      const inferredMake = inferMakeFromModel(newModel) || 'Unknown';

      console.log(`[FIXING] Vehicle ID ${v.id}: "${makeVal}" / "${modelVal}" -> Make: "${inferredMake}", Model: "${newModel}"`);
      
      await connection.query(
        'UPDATE vehicles SET make = ?, model = ? WHERE id = ?',
        [inferredMake, newModel, v.id]
      );
      fixCount++;
    }
  }

  console.log(`Migration finished. Fixed ${fixCount} records.`);
  await connection.end();
}

migrate().catch(err => {
  console.error('Migration failed:', err);
});
