const CONFIG = {

    WP_URL: 'https://fernriffor.laboratoriodiseno.cl/wordpress-js',

    get GRAPHQL() { return this.WP_URL + '/graphql'; },
    get REST() { return this.WP_URL + '/wp-json/wp/v2'; },
    get RANKING() { return this.WP_URL + '/wp-json/miflix/v1/ranking'; },

    get JWT() { return this.WP_URL + '/wp-json/jwt-auth/v1/token'; },

    CPTS: [
        { etiqueta: 'Películas',    plural: 'peliculas',    singular: 'Pelicula',    grupoAcf: 'camposFicha' },
        { etiqueta: 'Series',       plural: 'series',       singular: 'Serie',       grupoAcf: 'camposFicha' },
        { etiqueta: 'Documentales', plural: 'documentales', singular: 'Documental',  grupoAcf: 'camposFicha' }
    ],

    CAMPO_ANIO: 'anio',
    CAMPO_GENERO: 'genero'
};

let token = null;
let cptActual = null;
let itemActual = null;
try { token = sessionStorage.getItem('miflix_token'); } catch (e) {  }

const estado = { texto: '', tipo: 'todos', genero: 'todos', orden: 'normal' };
const swipers = {};
const cache = {};
let resultados = [];
let peticionActual = 0;

function esc(txt) {
    return $('<div>').text(txt == null ? '' : txt).html();
}
function mensaje(txt, esError) {
    $('#mensaje').text(txt).toggleClass('error', !!esError);
}
function cabeceras() {
    const h = {};
    if (token) h['Authorization'] = 'Bearer ' + token;
    return h;
}

async function graphql(query, conAuth) {
    let resp;
    try {
        resp = await $.ajax({
            url: CONFIG.GRAPHQL,
            method: 'POST',
            contentType: 'application/json',
            headers: conAuth ? cabeceras() : {},
            data: JSON.stringify({ query })
        });
    } catch (xhr) {
        throw 'Error de conexión' + (xhr && xhr.status ? ' (' + xhr.status + ')' : '');
    }

    if (resp.errors && resp.errors.length) {
        throw resp.errors[0].message;
    }
    return resp.data;
}

async function pedirRest(ruta) {
    const respuesta = await fetch(CONFIG.REST + ruta);
    if (!respuesta.ok) {
        throw new Error('Error ' + respuesta.status + ' al consultar ' + ruta);
    }
    return respuesta.json();
}

function queryCpt(cpt) {
    return `
    {
        ${cpt.plural}(first: 100) {
            nodes {
                id
                databaseId
                title
                content
                featuredImage { node { sourceUrl } }
                ${cpt.grupoAcf} {
                    ${CONFIG.CAMPO_ANIO}
                    ${CONFIG.CAMPO_GENERO}
                }
            }
        }
    }`;
}

async function cargarCpt(cpt) {
    const data = await graphql(queryCpt(cpt), false);
    return data[cpt.plural].nodes;
}

function normalizar(txt) {
    return String(txt == null ? '' : txt)
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase().trim();
}
function textoPlano(html) {
    return new DOMParser().parseFromString(html || '', 'text/html').body.textContent;
}
function anioDe(cpt, item) {
    return Number((item[cpt.grupoAcf] || {})[CONFIG.CAMPO_ANIO]) || 0;
}
function generoDe(cpt, item) {
    return (item[cpt.grupoAcf] || {})[CONFIG.CAMPO_GENERO] || '';
}

function coincideLocal(cpt, item, texto) {
    const base = normalizar([item.title, anioDe(cpt, item) || '', generoDe(cpt, item), textoPlano(item.content)].join(' '));
    return normalizar(texto).split(/\s+/).every(function (palabra) {
        return base.indexOf(palabra) !== -1;
    });
}

async function buscarCpt(cpt, texto) {
    const base = cache[cpt.plural] || [];
    const ids = {};

    base.forEach(function (item) {
        if (coincideLocal(cpt, item, texto)) ids[item.databaseId] = true;
    });

    try {
        const posts = await pedirRest(`/${cpt.plural}?per_page=100&_fields=id&search=${encodeURIComponent(texto)}`);
        posts.forEach(function (p) { ids[p.id] = true; });
    } catch (err) {
        console.error('La búsqueda en la API REST falló para ' + cpt.etiqueta + ', se usa solo el filtro local:', err);
    }

    return base.filter(function (item) { return ids[item.databaseId]; });
}

function plantillaCard(cpt, item, idx) {
    const acf = item[cpt.grupoAcf] || {};
    const img = item.featuredImage && item.featuredImage.node
        ? `<img class="poster" src="${item.featuredImage.node.sourceUrl}" alt="Póster de ${esc(item.title)}" loading="lazy">`
        : `<div class="poster-vacio" aria-hidden="true">Sin carátula</div>`;
    return `
        <article class="card" tabindex="0" role="button"
                 data-cpt="${cpt.plural}" data-idx="${idx}">
            ${img}
            <h4>${esc(item.title)}</h4>
            <p>${esc(acf[CONFIG.CAMPO_ANIO] || '')} ${acf[CONFIG.CAMPO_GENERO] ? '· ' + esc(acf[CONFIG.CAMPO_GENERO]) : ''}</p>
        </article>`;
}

function pintarFila(cpt, nodes) {
    cache[cpt.plural] = nodes;
    const slug = 'sw-' + cpt.plural;

    $('#fila-' + cpt.plural).prop('hidden', false).html(`
        <h3>${cpt.etiqueta}</h3>
        <div class="swiper" id="${slug}">
            <div class="swiper-wrapper"></div>
        </div>`);

    nodes.forEach(function (item, idx) {
        $(`#${slug} .swiper-wrapper`).append(`<div class="swiper-slide">${plantillaCard(cpt, item, idx)}</div>`);
    });

    swipers[cpt.plural] = new Swiper('#' + slug, {
        slidesPerView: 2.2,
        spaceBetween: 12,
        freeMode: true,
        keyboard: { enabled: true },
        breakpoints: {
            600:  { slidesPerView: 3.2 },
            900:  { slidesPerView: 4.4 },
            1200: { slidesPerView: 6.2 }
        }
    });
}

function pintarHero(cpt, item) {
    const acf = item[cpt.grupoAcf] || {};
    $('#hero-titulo').text(item.title);
    $('#hero-sinopsis').text(textoPlano(item.content).slice(0, 180) + (acf[CONFIG.CAMPO_GENERO] ? ' · ' + acf[CONFIG.CAMPO_GENERO] : ''));
    if (item.featuredImage && item.featuredImage.node) {
        const url = item.featuredImage.node.sourceUrl;
        $('#hero').css('--hero-img', `url("${url}")`);
        $('#hero-poster').attr({ src: url, alt: 'Póster de ' + item.title }).prop('hidden', false);
    }
}

function poblarGeneros() {
    const generos = {};
    CONFIG.CPTS.forEach(function (c) {
        (cache[c.plural] || []).forEach(function (item) {
            const g = generoDe(c, item);
            if (g) generos[normalizar(g)] = g;
        });
    });

    const $sel = $('#filtro-genero').empty().append('<option value="todos">Todos los géneros</option>');
    Object.keys(generos).sort().forEach(function (k) {
        $sel.append($('<option>').val(generos[k]).text(generos[k]));
    });

    $sel.val(estado.genero);
    if (!$sel.val()) {
        estado.genero = 'todos';
        $sel.val('todos');
    }
}

function hayFiltros() {
    return estado.texto.trim() !== '' || estado.tipo !== 'todos' ||
           estado.genero !== 'todos' || estado.orden !== 'normal';
}

async function obtenerBase() {
    const cpts = CONFIG.CPTS.filter(function (c) {
        return estado.tipo === 'todos' || c.plural === estado.tipo;
    });
    const texto = estado.texto.trim();

    if (!texto) {
        const lista = [];
        cpts.forEach(function (c) {
            (cache[c.plural] || []).forEach(function (item) { lista.push({ cpt: c, item: item }); });
        });
        return lista;
    }

    const grupos = await Promise.all(cpts.map(async function (c) {
        const nodos = await buscarCpt(c, texto);
        return nodos.map(function (item) { return { cpt: c, item: item }; });
    }));
    return grupos.flat();
}

function filtrarYOrdenar(lista) {
    let salida = lista;

    if (estado.genero !== 'todos') {
        salida = salida.filter(function (x) {
            return normalizar(generoDe(x.cpt, x.item)) === normalizar(estado.genero);
        });
    }

    if (estado.orden === 'titulo') {
        salida.sort(function (a, b) { return a.item.title.localeCompare(b.item.title, 'es'); });
    } else if (estado.orden === 'anio-desc') {
        salida.sort(function (a, b) { return anioDe(b.cpt, b.item) - anioDe(a.cpt, a.item); });
    } else if (estado.orden === 'anio-asc') {
        salida.sort(function (a, b) { return anioDe(a.cpt, a.item) - anioDe(b.cpt, b.item); });
    }
    return salida;
}

function pintarResultados(lista) {
    resultados = lista;
    $('#filas').prop('hidden', true);
    $('#fila-ranking').prop('hidden', true);
    $('#seccion-resultados').prop('hidden', false);

    if (!lista.length) {
        $('#resultados').html('<p class="mensaje">No encontramos nada con esos filtros. Prueba con otra búsqueda.</p>');
    } else {
        $('#resultados').html(lista.map(function (x, i) {
            return plantillaCard(x.cpt, x.item, i);
        }).join(''));
    }
    $('#contador').text(lista.length === 1 ? '1 resultado' : lista.length + ' resultados');
}

function mostrarCartelera() {
    resultados = [];
    $('#seccion-resultados').prop('hidden', true);
    $('#filas').prop('hidden', false);
    $('#fila-ranking').prop('hidden', !$('#ranking').children().length);
    $('#contador').text('');
    Object.keys(swipers).forEach(function (k) { swipers[k].update(); });
}

async function aplicarFiltros() {
    const turno = ++peticionActual;

    if (!hayFiltros()) {
        mostrarCartelera();
        return;
    }

    $('#contador').text('Buscando…');
    const lista = await obtenerBase();
    if (turno !== peticionActual) return;
    pintarResultados(filtrarYOrdenar(lista));
}

async function cargarCartelera() {
    mensaje('Cargando cartelera…');

    CONFIG.CPTS.forEach(function (cpt) {
        $('#filas').append(`<section class="fila" id="fila-${cpt.plural}" aria-label="${cpt.etiqueta}" hidden></section>`);
    });

    const respuestas = await Promise.allSettled(CONFIG.CPTS.map(cargarCpt));
    let heroPuesto = false;
    let fallos = 0;

    respuestas.forEach(function (respuesta, i) {
        const cpt = CONFIG.CPTS[i];
        if (respuesta.status === 'rejected') {
            fallos++;
            console.error('Error al obtener ' + cpt.etiqueta + ':', respuesta.reason);
            return;
        }
        const nodes = respuesta.value;
        if (!nodes.length) return;
        pintarFila(cpt, nodes);
        if (!heroPuesto) { pintarHero(cpt, nodes[0]); heroPuesto = true; }
    });

    if (fallos === CONFIG.CPTS.length) {
        mensaje('No se pudo conectar con WordPress. Revisa CONFIG.WP_URL y los nombres de los CPT.', true);
        $('#hero-titulo').text('Sin conexión');
    } else {
        mensaje(fallos ? 'Algunas categorías no cargaron (revisa la consola).' : '', !!fallos);
    }

    poblarGeneros();
    aplicarFiltros();
}

async function cargarRanking() {
    try {
        const filas = await $.ajax({ url: CONFIG.RANKING, method: 'GET', dataType: 'json' });
        if (!filas.length) return;
        filas.forEach(function (f) {
            $('#ranking').append(`
                <li><span>${esc(f.titulo)}</span><span>${esc(f.tipo || '')}</span><span>${Number(f.vistas).toLocaleString('es-CL')} vistas</span></li>`);
        });
        $('#fila-ranking').prop('hidden', hayFiltros());
    } catch (err) {
        console.error('Error al obtener la tabla personalizada:', err);
    }
}

function abrirModal(cpt, item) {
    cptActual = cpt; itemActual = item;
    const acf = item[cpt.grupoAcf] || {};
    $('#m-titulo').text(item.title);
    $('#m-anio').text(acf[CONFIG.CAMPO_ANIO] || 's/f');
    $('#m-genero').text(acf[CONFIG.CAMPO_GENERO] || cpt.etiqueta);
    $('#m-sinopsis').html(item.content || '<p>Sin descripción.</p>');

    const posterVacio = 'data:image/svg+xml,' + encodeURIComponent(
        "<svg xmlns='http://www.w3.org/2000/svg' width='240' height='360'><rect width='100%' height='100%' fill='#2a2a35'/>" +
        "<text x='50%' y='50%' font-size='20' fill='#a0a0ad' font-family='sans-serif' text-anchor='middle' dominant-baseline='middle'>Sin carátula</text></svg>");
    const tienePoster = item.featuredImage && item.featuredImage.node;
    $('#m-img').attr('src', tienePoster ? item.featuredImage.node.sourceUrl : posterVacio)
               .attr('alt', tienePoster ? 'Póster de ' + item.title : '');
    $('#m-admin').prop('hidden', !token);
    $('#modal').prop('hidden', false);
    $('#m-cerrar').trigger('focus');
}
function cerrar(sel) { $(sel).prop('hidden', true); }

async function login(user, pass) {
    try {
        const resp = await $.ajax({
            url: CONFIG.JWT,
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({ username: user, password: pass })
        });
        return resp.token;
    } catch (xhr) {
        throw xhr.responseJSON && xhr.responseJSON.message
            ? textoPlano(xhr.responseJSON.message)
            : 'error de conexión';
    }
}
function actualizarSesionUI() {
    $('#btn-login').text(token ? 'Cerrar sesión' : 'Iniciar sesión');
    $('#btn-nuevo').prop('hidden', !token);
}

function acfInput(cpt, anio, genero) {
    const partes = [];
    if (anio !== '' && anio != null) partes.push(`${CONFIG.CAMPO_ANIO}: ${JSON.stringify(String(anio))}`);
    if (genero) partes.push(`${CONFIG.CAMPO_GENERO}: ${JSON.stringify(genero)}`);
    return partes.length ? `${cpt.grupoAcf}: { ${partes.join(', ')} }` : '';
}

function crear(cpt, d) {
    const mutation = `
    mutation {
        create${cpt.singular}(input: {
            status: PUBLISH
            title: ${JSON.stringify(d.titulo)}
            content: ${JSON.stringify(d.contenido)}
            ${acfInput(cpt, d.anio, d.genero)}
        }) {
            ${cpt.singular.charAt(0).toLowerCase() + cpt.singular.slice(1)} { id title }
        }
    }`;
    return graphql(mutation, true);
}

function actualizar(cpt, id, d) {
    const mutation = `
    mutation {
        update${cpt.singular}(input: {
            id: ${JSON.stringify(id)}
            title: ${JSON.stringify(d.titulo)}
            content: ${JSON.stringify(d.contenido)}
            ${acfInput(cpt, d.anio, d.genero)}
        }) {
            ${cpt.singular.charAt(0).toLowerCase() + cpt.singular.slice(1)} { id title }
        }
    }`;
    return graphql(mutation, true);
}

function eliminar(cpt, id) {

    const mutation = `
    mutation {
        delete${cpt.singular}(input: { id: ${JSON.stringify(id)} }) {
            deletedId
        }
    }`;
    return graphql(mutation, true);
}

function recargar() {
    Object.keys(swipers).forEach(function (k) {
        swipers[k].destroy(true, true);
        delete swipers[k];
    });
    $('#filas').empty();
    return cargarCartelera();
}

$(document).ready(function () {

    console.log('jQuery está funcionando correctamente. v' + $.fn.jquery);

    CONFIG.CPTS.forEach(function (c, i) {
        $('#f-cpt').append(`<option value="${i}">${c.etiqueta}</option>`);
    });

    actualizarSesionUI();
    cargarCartelera();
    cargarRanking();

    $('#filas').on('click keydown', '.card', function (e) {
        if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        const cpt = CONFIG.CPTS.find(c => c.plural === $(this).data('cpt'));
        abrirModal(cpt, cache[cpt.plural][$(this).data('idx')]);
    });

    $('#resultados').on('click keydown', '.card', function (e) {
        if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        const r = resultados[$(this).data('idx')];
        if (r) abrirModal(r.cpt, r.item);
    });

    let temporizador = null;
    $('#q').on('input', function () {
        const valor = $(this).val();
        clearTimeout(temporizador);
        temporizador = setTimeout(function () {
            estado.texto = valor;
            aplicarFiltros();
        }, 300);
    });
    $('#form-buscar').on('submit', function (e) { e.preventDefault(); });

    $('#chips-tipo').on('click', '.chip', function () {
        $('#chips-tipo .chip').removeClass('activo');
        $(this).addClass('activo');
        estado.tipo = String($(this).data('tipo'));
        aplicarFiltros();
    });
    $('#filtro-genero').on('change', function () {
        estado.genero = $(this).val();
        aplicarFiltros();
    });
    $('#filtro-orden').on('change', function () {
        estado.orden = $(this).val();
        aplicarFiltros();
    });
    $('#btn-limpiar').on('click', function () {
        clearTimeout(temporizador);
        estado.texto = ''; estado.tipo = 'todos'; estado.genero = 'todos'; estado.orden = 'normal';
        $('#q').val('');
        $('#chips-tipo .chip').removeClass('activo').first().addClass('activo');
        $('#filtro-genero').val('todos');
        $('#filtro-orden').val('normal');
        aplicarFiltros();
    });

    $('#m-cerrar').on('click', () => cerrar('#modal'));
    $('[data-cerrar]').on('click', function () { cerrar($(this).data('cerrar')); });
    $('.modal').on('click', function (e) { if (e.target === this) $(this).prop('hidden', true); });
    $(document).on('keydown', e => { if (e.key === 'Escape') $('.modal').prop('hidden', true); });

    $('#btn-login').on('click', function () {
        if (token) {
            token = null;
            try { sessionStorage.removeItem('miflix_token'); } catch (e) {}
            actualizarSesionUI();
            mensaje('Sesión cerrada.');
        } else {
            $('#login').prop('hidden', false);
            $('#l-user').trigger('focus');
        }
    });
    $('#form-login').on('submit', async function (e) {
        e.preventDefault();
        try {
            token = await login($('#l-user').val(), $('#l-pass').val());
            try { sessionStorage.setItem('miflix_token', token); } catch (er) {}
            $('#form-login')[0].reset();
            cerrar('#login');
            actualizarSesionUI();
            mensaje('Sesión iniciada. Ya puedes crear, editar y eliminar.');
        } catch (err) {
            mensaje('No se pudo iniciar sesión: ' + err, true);
            cerrar('#login');
        }
    });

    $('#btn-nuevo').on('click', function () {
        $('#form-cpt')[0].reset();
        $('#f-id').val('');
        $('#f-cpt').prop('disabled', false);
        $('#f-encabezado').text('Nuevo título');
        $('#panel').prop('hidden', false);
    });

    $('#m-editar').on('click', function () {
        const acf = itemActual[cptActual.grupoAcf] || {};
        $('#f-encabezado').text('Editar título');
        $('#f-id').val(itemActual.id);
        $('#f-cpt').val(CONFIG.CPTS.indexOf(cptActual)).prop('disabled', true);
        $('#f-titulo').val(itemActual.title);
        $('#f-contenido').val(textoPlano(itemActual.content).trim());
        $('#f-anio').val(acf[CONFIG.CAMPO_ANIO] || '');
        $('#f-genero').val(acf[CONFIG.CAMPO_GENERO] || '');
        cerrar('#modal');
        $('#panel').prop('hidden', false);
    });

    $('#form-cpt').on('submit', async function (e) {
        e.preventDefault();
        const cpt = CONFIG.CPTS[$('#f-cpt').val()];
        const d = {
            titulo: $('#f-titulo').val(),
            contenido: $('#f-contenido').val(),
            anio: $('#f-anio').val(),
            genero: $('#f-genero').val()
        };
        const id = $('#f-id').val();

        try {
            const data = id ? await actualizar(cpt, id, d) : await crear(cpt, d);
            console.log(id ? 'Entrada actualizada:' : 'Entrada creada:', data);
            cerrar('#panel');
            mensaje(id ? 'Título actualizado.' : 'Título creado.');
            recargar();
        } catch (err) {
            console.error('Error al guardar:', err);
            mensaje('No se pudo guardar: ' + err, true);
        }
    });

    $('#m-eliminar').on('click', async function () {
        if (!window.confirm('¿Eliminar "' + itemActual.title + '"?')) return;
        try {
            const data = await eliminar(cptActual, itemActual.id);
            console.log('Entrada eliminada:', data);
            cerrar('#modal');
            mensaje('Título eliminado.');
            recargar();
        } catch (err) {
            console.error('Error al eliminar:', err);
            mensaje('No se pudo eliminar: ' + err, true);
        }
    });
});
