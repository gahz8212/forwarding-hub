const validChars = '가나다라마거너더러머버서어저고노도로모보소오조구누두루무부수우주바사아자배허하호';

function testRegex(text) {
  const cleanText = text.replace(/[\s\-_:\.,\|'\"\[\]\(\)\<\>]/g, '').toUpperCase();
  const plateMatch2 = cleanText.match(new RegExp(`등록번호([0-9]{2,3}[${validChars}]?[0-9]{4})|등록번호([0-9${validChars}]+)차종`));
  let result = null;
  if (plateMatch2) {
    result = plateMatch2[1] || plateMatch2[2];
  } else {
    const plateRegex = new RegExp(`\\d{2,3}[${validChars}]\\d{4}`, 'g');
    const plateMatch = cleanText.match(plateRegex);
    if (plateMatch && plateMatch.length > 0) {
      result = plateMatch[0];
    }
  }
  console.log(`Input: ${text} -> Clean: ${cleanText} -> Result: ${result}`);
}

testRegex("등록번호 82다8212 차종");
testRegex("등록번호82다8212차종");
testRegex("등록번호 82 다 8212");
testRegex("등록번호 82-8212");
testRegex("82다8212");
