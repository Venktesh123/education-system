const XLSX = require("xlsx");
const { validateUserData } = require("./validation");

const parseExcelFile = async (filePath) => {
  try {
    const workbook = XLSX.readFile(filePath);
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(worksheet);

    const validatedData = [];
    for (const row of data) {
      const validatedRow = await validateUserData(row);
      if (validatedRow) {
        validatedData.push(validatedRow);
      }
    }

    return validatedData;
  } catch (error) {
    throw new Error("Error parsing Excel file: " + error.message);
  }
};

module.exports = { parseExcelFile };
