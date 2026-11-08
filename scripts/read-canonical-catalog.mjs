export async function readCanonicalCatalog({repository='opsemilygohmbza/game-index-runner',token='',request=fetch}={}) {
  if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository))throw new Error('Invalid canonical repository');
  const headers={Accept:'application/vnd.github+json','Cache-Control':'no-cache',...(token?{Authorization:`Bearer ${token}`}:{})};
  async function json(endpoint){
    const response=await request(`https://api.github.com/repos/${repository}/${endpoint}`,{headers,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw new Error(`Canonical GitHub API returned ${response.status}`);
    return response.json();
  }
  const file=await json('contents/list.json?ref=main');
  if(!/^[a-f0-9]{40,64}$/.test(file.sha||''))throw new Error('Canonical catalog has no valid Git object ID');
  // Contents omits inline content for files above 1 MiB. Fetch that immutable
  // blob, not a separately cached raw/main URL that may point at an old list.
  const blob=file.encoding==='base64'?file:await json(`git/blobs/${file.sha}`);
  if(blob.encoding!=='base64'||typeof blob.content!=='string')throw new Error('Unsupported canonical catalog encoding');
  const bytes=Buffer.from(blob.content,'base64');
  if(bytes.length>10*1024*1024)throw new Error('Canonical catalog exceeds the 10 MiB build budget');
  const entries=JSON.parse(bytes.toString('utf8'));
  if(!Array.isArray(entries))throw new Error('Canonical catalog must be an array');
  return{entries,blobSha:file.sha};
}
