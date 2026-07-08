const getStringSizeInKB = (str) => {
  const bytes = new TextEncoder().encode(str).length;
  const kb = bytes / 1024;
  return kb;
};



export const isValidSizeSqlQuery = (sql)=>{
    return getStringSizeInKB(sql) < 100 
}


