export async function loadHostPeers(load) {
  try { return await load() } catch (error) {
    if (error?.code !== 'ERR_MODULE_NOT_FOUND'
        || !/^Cannot find package '(?:@deepseek-ai\/(?:schemastery|dsh-tools|cordis))'/.test(error.message)) throw error
    return { error: String(error.message) }
  }
}
