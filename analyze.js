const fs = require('fs');
const XLSX = require('xlsx');

// 엑셀 데이터 로드
const workbook = XLSX.readFile('./한동훈토콘 (1).xlsx');
const sheet1 = workbook.Sheets['1. 신청자리스트'];
const data1 = XLSX.utils.sheet_to_json(sheet1, { header: 1 }).slice(1);

// DB JSON 파싱
const dbRaw = fs.readFileSync('/tmp/db_data.json', 'utf8');
const match = dbRaw.match(/"results":\s*\[([\s\S]*?)\]/);
if (match === null) {
  console.log('DB 데이터 파싱 실패');
  process.exit(1);
}
const dbData = JSON.parse('[' + match[1] + ']');

// DB 데이터를 키로 저장
const dbMap = new Map();
dbData.forEach(row => {
  dbMap.set(row.key, { is_paid: row.is_paid, ticket_count: row.ticket_count });
});

console.log('=== 엑셀 1,408명 중 DB에서 입금완료 안된 사람들 ===\n');

const notInDbList = [];
const unpaidInDbList = [];

data1.forEach((row, idx) => {
  const name = row[2];
  const phone = String(row[3] || '').replace(/-/g, '');
  const last4 = phone.slice(-4);
  const tempIndex = row[10] || (name + last4);
  const ticketCount = row[5] || 1;

  const db = dbMap.get(tempIndex);

  if (db === undefined) {
    notInDbList.push({ tempIndex, name, phone, ticketCount });
  } else if (db.is_paid === 0) {
    unpaidInDbList.push({ tempIndex, name, phone, ticketCount });
  }
});

console.log('1. DB에 존재하지 않는 사람들:', notInDbList.length, '건');
let notInDbPeople = 0;
notInDbList.forEach(p => {
  notInDbPeople += p.ticketCount;
  console.log('   -', p.tempIndex, '| 이름:', p.name, '| 전화:', p.phone, '| 티켓:', p.ticketCount + '인');
});
console.log('   => 소계:', notInDbPeople, '명\n');

console.log('2. DB에 있지만 미입금 상태인 사람들:', unpaidInDbList.length, '건');
let unpaidPeople = 0;
unpaidInDbList.forEach(p => {
  unpaidPeople += p.ticketCount;
  console.log('   -', p.tempIndex, '| 이름:', p.name, '| 전화:', p.phone, '| 티켓:', p.ticketCount + '인');
});
console.log('   => 소계:', unpaidPeople, '명\n');

console.log('=== 요약 ===');
console.log('엑셀 총 인원: 1,408명');
console.log('DB 입금완료 반영된 인원:', 1408 - notInDbPeople - unpaidPeople, '명');
console.log('DB 입금완료 반영 안된 인원:', notInDbPeople + unpaidPeople, '명');
console.log('  - DB에 없음:', notInDbPeople, '명');
console.log('  - DB 미입금:', unpaidPeople, '명');

// 티켓수 불일치 확인
console.log('\n=== 티켓수 불일치 확인 ===');
const ticketMismatch = [];
data1.forEach((row, idx) => {
  const name = row[2];
  const phone = String(row[3] || '').replace(/-/g, '');
  const last4 = phone.slice(-4);
  const tempIndex = row[10] || (name + last4);
  const excelTicket = row[5] || 1;

  const db = dbMap.get(tempIndex);
  if (db && db.ticket_count !== excelTicket) {
    ticketMismatch.push({ tempIndex, name, excelTicket, dbTicket: db.ticket_count });
  }
});

if (ticketMismatch.length > 0) {
  console.log('티켓수 불일치:', ticketMismatch.length, '건');
  ticketMismatch.forEach(p => {
    console.log('  -', p.tempIndex, '| 엑셀:', p.excelTicket + '인 | DB:', p.dbTicket + '인');
  });
} else {
  console.log('티켓수 불일치 없음');
}
