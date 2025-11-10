   export default async (req, res) => {
  // Adicione CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') return res.status(405).end();

     const { clientId, reseller } = req.body;
     const gitlabToken = 'glpat-wuCsKS0XQGmeiIcN_cFQj286MQp1OmlwMGI2Cw.01.120z5yk19';
     const projectId = 'Ronnyntech/autologin';
     const filePath = 'Key.json';
     const branch = 'main';

     try {
       // Busque JSON
       const response = await fetch(`https://gitlab.com/api/v4/projects/${projectId}/repository/files/${encodeURIComponent(filePath)}?ref=${branch}`, {
         headers: { 'Authorization': `Bearer ${gitlabToken}` }
       });
       const gitData = await response.json();
       let currentJson = JSON.parse(Buffer.from(gitData.content, 'base64').toString());

       // Atualize
       if (!currentJson.revendas) currentJson.revendas = {};
       if (!currentJson.revendas[reseller]) currentJson.revendas[reseller] = { verifiedIds: [] };
       if (!currentJson.revendas[reseller].verifiedIds.includes(clientId)) {
         currentJson.revendas[reseller].verifiedIds.push(clientId);
       }

       // Commit
       await fetch(`https://gitlab.com/api/v4/projects/${projectId}/repository/files/${encodeURIComponent(filePath)}`, {
         method: 'PUT',
         headers: { 'Authorization': `Bearer ${gitlabToken}`, 'Content-Type': 'application/json' },
         body: JSON.stringify({
           branch,
           content: Buffer.from(JSON.stringify(currentJson)).toString('base64'),
           commit_message: `Add verified client ID for ${reseller}`
         })
       });

       res.status(200).json({ success: true });
     } catch (error) {
       res.status(500).json({ error: error.message });
     }
   };
   
