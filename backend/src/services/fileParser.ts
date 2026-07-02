import ExcelJS from 'exceljs';
import pdfParse = require('pdf-parse');
import fs from 'fs';

// Excel 파일 파싱 헬퍼
export async function parseExcelToGridData(filePath: string): Promise<any[][]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const worksheet = workbook.getWorksheet(1) || workbook.worksheets[0];

  if (!worksheet) {
    return [['빈 시트']];
  }

  const gridData: any[][] = [];
  let maxCols = 0;

  worksheet.eachRow({ includeEmpty: true }, (row) => {
    const rowData: any[] = [];
    const values = (row.values as any[]) || [];

    // exceljs row.values는 1-indexed이므로 values[0]은 비어있음
    if (values.length - 1 > maxCols) {
      maxCols = values.length - 1;
    }

    for (let i = 1; i < values.length; i++) {
      let val = values[i];
      if (val !== null && typeof val === 'object') {
        if (val instanceof Date) {
          val = val.toISOString().split('T')[0];
        } else if (val.result !== undefined) {
          val = val.result;
        } else if (val.text !== undefined) {
          val = val.text; // 하이퍼링크 객체
        } else if (val.richText !== undefined) {
          val = val.richText.map((t: any) => t.text).join('');
        } else {
          val = JSON.stringify(val);
        }
      }
      rowData.push(val === undefined ? null : val);
    }
    gridData.push(rowData);
  });

  // 모든 행의 길이를 동일하게 패딩 맞춤
  for (let i = 0; i < gridData.length; i++) {
    while (gridData[i].length < maxCols) {
      gridData[i].push(null);
    }
  }

  return gridData.length > 0 ? gridData : [['데이터 없음']];
}

// PDF 파일 파싱 헬퍼 (텍스트 추출 후 라인 및 멀티 스페이스 기준 열 분할)
export async function parsePdfToGridData(filePath: string): Promise<any[][]> {
  const dataBuffer = fs.readFileSync(filePath);
  const data = await (pdfParse as any)(dataBuffer);
  
  const lines = data.text.split('\n');
  const gridData: any[][] = [];
  let maxCols = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // 공백이 2개 이상 연속되거나 탭 문자가 있을 때 열로 취급하여 분할
    const cells = trimmed.split(/\s{2,}/);
    if (cells.length > 0) {
      if (cells.length > maxCols) {
        maxCols = cells.length;
      }
      gridData.push(cells);
    }
  }

  // 모든 행 패딩 맞춤
  for (let i = 0; i < gridData.length; i++) {
    while (gridData[i].length < maxCols) {
      gridData[i].push(null);
    }
  }

  if (gridData.length === 0) {
    return [['PDF 추출 텍스트'], [data.text || '추출된 텍스트가 없습니다.']];
  }

  return gridData;
}
