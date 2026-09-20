'use strict';

/**
 * Converte endereco em coordenadas (latitude/longitude).
 *
 * Usa o Nominatim (OpenStreetMap) por padrao: sem chave, sem cartao.
 * Se GOOGLE_MAPS_API_KEY existir no ambiente, usa o Google, que e mais
 * preciso em enderecos residenciais no Brasil. A troca e so a variavel.
 */

const USER_AGENT = 'NoahConnect/1.0 (painel da igreja)';

/** Junta as partes do endereco em uma linha unica para a busca. */
function montarEndereco({ endereco, bairro, cidade, estado, cep }) {
  const partes = [endereco, bairro, cidade, estado, cep, 'Brasil']
    .map((p) => (p || '').trim())
    .filter(Boolean);
  return partes.length > 2 ? partes.join(', ') : null;
}

async function buscarNoNominatim(consulta) {
  const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=' + encodeURIComponent(consulta);
  const resp = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!resp.ok) throw new Error('Nominatim respondeu ' + resp.status);
  const dados = await resp.json();
  if (!dados.length) return null;
  return {
    latitude: parseFloat(dados[0].lat),
    longitude: parseFloat(dados[0].lon),
    origem: 'nominatim',
  };
}

async function buscarNoGoogle(consulta, chave) {
  const url = 'https://maps.googleapis.com/maps/api/geocode/json?address=' + encodeURIComponent(consulta) + '&region=br&key=' + chave;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error('Google respondeu ' + resp.status);
  const dados = await resp.json();
  if (dados.status !== 'OK' || !dados.results.length) return null;
  const loc = dados.results[0].geometry.location;
  return { latitude: loc.lat, longitude: loc.lng, origem: 'google' };
}

/**
 * Devolve { latitude, longitude, origem } ou null.
 *
 * Nunca lanca erro: endereco e opcional, entao uma falha aqui nao pode
 * impedir o cadastro do membro. Sem coordenadas ele apenas nao aparece
 * no mapa, e pode ser geocodificado depois.
 */
async function geocodificar(partes) {
  const consulta = montarEndereco(partes || {});
  if (!consulta) return null;

  const chaveGoogle = process.env.GOOGLE_MAPS_API_KEY;
  try {
    return chaveGoogle
      ? await buscarNoGoogle(consulta, chaveGoogle)
      : await buscarNoNominatim(consulta);
  } catch (err) {
    console.warn('[geocoding] Falha ao converter endereco:', err.message);
    return null;
  }
}

module.exports = { geocodificar, montarEndereco };
