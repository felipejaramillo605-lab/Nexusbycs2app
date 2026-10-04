import fs from 'fs';
import path from 'path';
const page=fs.readFileSync(path.join(__dirname,'ManagerSupport.jsx'),'utf8');
test('PQRS suggestion remains manual and accepts the returned fields',()=>{
  expect(page).toContain('Sugerir tipo y prioridad');
  expect(page).toContain('setForm(current=>({...current,...r.data.suggestion}))');
  expect(page).toContain('Puedes cambiarla antes de enviar.');
});
