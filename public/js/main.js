// Importações dos módulos da Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getFirestore, collection, onSnapshot, doc, addDoc, setDoc, deleteDoc, getDocs, updateDoc, query, where, writeBatch, serverTimestamp, arrayUnion } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

// =================================================================================
// 0. FUNÇÃO PARA CARREGAR SCRIPTS EXTERNOS
// =================================================================================
function loadScript(url) {
    return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${url}"]`)) {
            resolve();
            return;
        }
        const script = document.createElement('script');
        script.src = url;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

// =================================================================================
// 1. CONFIGURAÇÃO DA FIREBASE
// =================================================================================
const firebaseConfig = {
    apiKey: "AIzaSyBMQNvxHmLvRmTJ_6ttje71T2hnynhvQrM", // Mantenha as suas chaves aqui
    authDomain: "coolup-drinks-site-9e015.firebaseapp.com",
    projectId: "coolup-drinks-site-9e015",
    storageBucket: "coolup-drinks-site-9e015.appspot.com",
    messagingSenderId: "783668278663",
    appId: "1:783668278663:web:988cf9e4d4479db4984f22",
    measurementId: "G-JDBQ306SJ5"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const productsCollection = collection(db, 'products');
const ordersCollection = collection(db, 'orders');
const customersCollection = collection(db, 'customers'); // NOVO: Coleção de Clientes

// =================================================================================
// ESTADO DA APLICAÇÃO E LÓGICA DA IA
// =================================================================================
let localProducts = [], localOrders = [], localCustomers = [], currentUser = null;
const chatState = { 
    isOpen: false, 
    currentStep: 'welcome', 
    cart: [], 
    customer: { name: '', phone: '' },
    address: { cep: '', street: '', number: '', complement: '', neighborhood: '', city: '', state: '' },
    orderId: null 
};
let unsubscribeFromOrder = null;

async function getApiResponse(prompt) { try { const response = await fetch('/.netlify/functions/get-gemini-response', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt }) }); const data = await response.json(); if (!response.ok) { throw new Error(data.error || 'Erro desconhecido no servidor.'); } return data.response; } catch (error) { console.error('Erro ao chamar a função Gemini da Netlify:', error); return `ERRO: ${error.message}`; } }
async function getNutritionalInfo(ingredients) { const ingredientList = ingredients.map(i => `${i.name} (${i.quantity}g)`).join(', '); const prompt = `Analise a seguinte lista de ingredientes para uma bebida: ${ingredientList}. Retorne sua resposta como um objeto JSON, e APENAS o objeto JSON, com as seguintes chaves: "calories", "protein", "carbs", "fat".`; const jsonString = await getApiResponse(prompt); if (jsonString.startsWith('ERRO:')) { alert(jsonString); return { calories: "Erro", protein: "Erro", carbs: "Erro", fat: "Erro" }; } try { return JSON.parse(jsonString.replace(/```json\n|\n```/g, '').trim()); } catch { return { calories: "N/A", protein: "N/A", carbs: "N/A", fat: "N/A" }; } }
async function getAdvancedChatAnswer(question) { const productNames = localProducts.map(p => p.name).join(', '); const prompt = `Você é um atendente virtual amigável para a 'CoolUp Drinks'. Responda à pergunta do cliente de forma concisa. Nossos produtos são: ${productNames}. Se a pergunta for irrelevante, diga que só pode ajudar com dúvidas sobre a loja. Pergunta: "${question}"`; return await getApiResponse(prompt); }

// =================================================================================
// TEMPLATES E RENDERIZAÇÃO
// =================================================================================
const appContainer = document.getElementById('app');
const Header = () => `
    <header class="bg-white/80 backdrop-blur-lg shadow-sm sticky top-0 z-30">
        <nav class="container mx-auto px-6 py-4 flex justify-between items-center">
            <a href="#" class="text-2xl font-bold text-indigo-600">CoolUp Drinks</a>
            <div class="flex items-center space-x-6">
                <a href="#" class="text-slate-600 hover:text-indigo-600 transition">Início</a>
                <a href="#products" class="text-slate-600 hover:text-indigo-600 transition">Produtos</a>
                ${currentUser ? `<a href="#admin" class="text-slate-600 hover:text-indigo-600 transition">Admin</a><button data-action="logout" class="bg-red-100 text-red-700 px-4 py-2 rounded-lg hover:bg-red-200 transition text-sm font-semibold">Logout</button>` : `<a href="#admin" class="bg-slate-100 text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-200 transition text-sm font-semibold">Admin</a>`}
            </div>
        </nav>
    </header>`;
const ProductsSection = () => `<section id="products" class="bg-slate-100 py-20"><div class="container mx-auto px-6"><h2 class="text-4xl font-bold text-center text-slate-900 mb-12">Nosso Cardápio</h2><div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">${localProducts.map(ProductCard).join('')}</div></div></section>`;
const ProductCard = (product) => `<div class="bg-white rounded-2xl shadow-lg overflow-hidden transform hover:-translate-y-2 transition-transform duration-300 flex flex-col"><img src="${product.imageUrl}" alt="${product.name}" class="w-full h-64 object-cover"><div class="p-6 flex flex-col flex-grow"><h3 class="text-2xl font-bold text-slate-900">${product.name}</h3><p class="mt-2 text-slate-600 flex-grow">${product.description}</p><div class="mt-4"><h4 class="font-semibold text-sm text-slate-500">Info Nutricional (estimativa)</h4><div class="grid grid-cols-2 gap-2 text-sm mt-2 text-slate-700"><span>🔥 Calorias: <strong>${product.nutritionalInfo?.calories || 'N/A'}</strong></span><span>💪 Proteína: <strong>${product.nutritionalInfo?.protein || 'N/A'}</strong></span><span>🍞 Carboidratos: <strong>${product.nutritionalInfo?.carbs || 'N/A'}</strong></span><span>🥑 Gorduras: <strong>${product.nutritionalInfo?.fat || 'N/A'}</strong></span></div></div><div class="mt-6 flex justify-between items-center"><span class="text-3xl font-extrabold text-indigo-600">R$ ${product.price.toFixed(2).replace('.', ',')}</span><button data-action="order-now" data-product-id="${product.id}" class="bg-indigo-100 text-indigo-700 font-bold py-2 px-4 rounded-lg hover:bg-indigo-200 transition">Pedir Agora</button></div></div></div>`;
const Footer = () => `<footer class="bg-slate-900 text-slate-400 py-8"><div class="container mx-auto px-6 text-center"><p>&copy; ${new Date().getFullYear()} CoolUp Drinks. Todos os direitos reservados.</p></div></footer>`;
const HeroSection = () => `<section class="container mx-auto px-6 py-24 text-center"><h1 class="text-5xl md:text-7xl font-extrabold text-slate-900 leading-tight">Seu gole de <span class="text-indigo-600">bem-estar</span>.</h1><p class="mt-6 text-lg text-slate-600 max-w-2xl mx-auto">Descubra sabores incríveis que refrescam seu corpo e sua mente.</p><a href="#products" class="mt-10 inline-block bg-indigo-600 text-white font-bold py-4 px-8 rounded-lg shadow-lg hover:bg-indigo-700 transition-transform transform hover:scale-105">Conheça Nossos Sabores!</a></section>`;
function renderPublicSite() { appContainer.innerHTML = `${Header()}<main>${HeroSection()}${ProductsSection()}</main>${Footer()}`; }
function renderLogin() { appContainer.innerHTML = `<div class="flex items-center justify-center min-h-screen bg-slate-100"><div class="w-full max-w-md p-8 space-y-6 bg-white rounded-lg shadow-md"><h2 class="text-2xl font-bold text-center text-slate-900">Acesso Administrativo</h2><form id="login-form" class="space-y-6"><div><label for="email" class="text-sm font-medium text-slate-700">Email</label><input id="email" name="email" type="email" required class="w-full px-3 py-2 mt-1 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"></div><div><label for="password" class="text-sm font-medium text-slate-700">Palavra-passe</label><input id="password" name="password" type="password" required class="w-full px-3 py-2 mt-1 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"></div><p id="login-error" class="text-sm text-red-600 hidden"></p><button type="submit" class="w-full py-2 px-4 font-semibold text-white bg-indigo-600 rounded-md hover:bg-indigo-700">Entrar</button></form><a href="#" class="block text-center text-sm text-indigo-600 hover:underline">Voltar ao site</a></div></div>`; }

// ADMIN PANEL RENDERING
function renderAdminPanel(view = 'dashboard') { const AdminSidebar = (activeView) => `<aside class="w-64 bg-slate-800 text-slate-300 p-6 flex-shrink-0 flex flex-col"><h2 class="text-white text-2xl font-bold mb-10">CoolUp Brain</h2><nav class="space-y-2"><a href="#admin/dashboard" class="flex items-center px-4 py-2 rounded-lg ${activeView === 'dashboard' ? 'bg-slate-700 text-white' : 'hover:bg-slate-700'}">Dashboard</a><a href="#admin/products" class="flex items-center px-4 py-2 rounded-lg ${activeView === 'products' ? 'bg-slate-700 text-white' : 'hover:bg-slate-700'}">Produtos</a><a href="#admin/customers" class="flex items-center px-4 py-2 rounded-lg ${activeView === 'customers' ? 'bg-slate-700 text-white' : 'hover:bg-slate-700'}">Clientes</a><a href="#admin/orders" class="flex items-center px-4 py-2 rounded-lg ${activeView === 'orders' ? 'bg-slate-700 text-white' : 'hover:bg-slate-700'}">Pedidos</a><a href="#admin/marketing" class="flex items-center px-4 py-2 rounded-lg ${activeView === 'marketing' ? 'bg-slate-700 text-white' : 'hover:bg-slate-700'}"><svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor"><path d="M11.984 1.529A.998.998 0 0011 1H9a1 1 0 00-.984.529L6.5 5H2v12h16V5h-4.5l-1.516-3.471zM10 15a4 4 0 110-8 4 4 0 010 8z" /><path d="M10 13a2 2 0 100-4 2 2 0 000 4z" /></svg>Marketing IA</a></nav><div class="mt-auto"><button data-action="logout" class="w-full text-center text-sm text-slate-400 hover:text-white mb-4">Logout</button><a href="#" class="block text-center text-sm text-slate-400 hover:text-white">Voltar ao Site</a></div></aside>`; appContainer.innerHTML = `<div class="flex h-screen bg-slate-100">${AdminSidebar(view)}<main id="admin-content" class="flex-1 p-8 overflow-y-auto"></main></div>`; const adminContent = document.getElementById('admin-content'); switch (view) { case 'products': renderAdminProducts(adminContent); break; case 'customers': renderAdminCustomers(adminContent); break; case 'orders': renderAdminOrders(adminContent); break; case 'marketing': renderAdminMarketing(adminContent); break; default: renderAdminDashboard(adminContent); break; } }
function renderAdminDashboard(container) { const totalRevenue = localOrders.reduce((sum, order) => sum + (order.status === 'pago' ? order.total : 0), 0); container.innerHTML = `<h1 class="text-3xl font-bold text-slate-900 mb-8">Dashboard</h1><div class="grid grid-cols-1 md:grid-cols-3 gap-6"><div class="bg-white p-6 rounded-lg shadow"><h3 class="text-slate-500 text-sm font-medium">Clientes Ativos</h3><p class="text-3xl font-bold text-blue-600 mt-2">${localCustomers.length}</p></div><div class="bg-white p-6 rounded-lg shadow"><h3 class="text-slate-500 text-sm font-medium">Total de Pedidos</h3><p class="text-3xl font-bold text-green-600 mt-2">${localOrders.length}</p></div><div class="bg-white p-6 rounded-lg shadow"><h3 class="text-slate-500 text-sm font-medium">Receita (Aprovada)</h3><p class="text-3xl font-bold text-amber-600 mt-2">R$ ${totalRevenue.toFixed(2).replace('.', ',')}</p></div></div>`; }
function renderAdminProducts(container) { container.innerHTML = `<div class="flex justify-between items-center mb-8"><h1 class="text-3xl font-bold text-slate-900">Gerenciar Produtos</h1><button data-action="add-product" class="bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-indigo-700 transition">+ Adicionar Sabor</button></div><div class="bg-white rounded-lg shadow overflow-hidden"><table class="w-full"><thead class="bg-slate-50"><tr><th class="p-4 text-left text-sm font-semibold text-slate-600">Produto</th><th class="p-4 text-left text-sm font-semibold text-slate-600">Preço</th><th class="p-4 text-left text-sm font-semibold text-slate-600">Ações</th></tr></thead><tbody class="divide-y divide-slate-200">${localProducts.map(p => `<tr><td class="p-4 flex items-center"><img src="${p.imageUrl}" class="w-12 h-12 rounded-md object-cover mr-4"><span class="font-medium text-slate-900">${p.name}</span></td><td class="p-4 text-slate-700">R$ ${p.price.toFixed(2).replace('.', ',')}</td><td class="p-4"><button data-action="edit-product" data-id="${p.id}" class="text-indigo-600 hover:text-indigo-900 mr-4">Editar</button><button data-action="delete-product" data-id="${p.id}" class="text-red-600 hover:text-red-900">Remover</button></td></tr>`).join('')}</tbody></table></div>`; }
function renderAdminCustomers(container) { container.innerHTML = `<h1 class="text-3xl font-bold text-slate-900 mb-8">Base de Clientes</h1><div class="bg-white rounded-lg shadow overflow-hidden"><table class="w-full text-sm"><thead class="bg-slate-50"><tr><th class="p-3 text-left font-semibold text-slate-600">Nome</th><th class="p-3 text-left font-semibold text-slate-600">WhatsApp</th><th class="p-3 text-left font-semibold text-slate-600">Pedidos</th><th class="p-3 text-left font-semibold text-slate-600">Gasto Total</th><th class="p-3 text-left font-semibold text-slate-600">Cliente Desde</th></tr></thead><tbody class="divide-y divide-slate-200">${localCustomers.length === 0 ? `<tr><td colspan="5" class="p-4 text-center text-slate-500">Nenhum cliente encontrado.</td></tr>` : localCustomers.map(c => `<tr><td class="p-3 font-medium text-slate-900">${c.name}</td><td class="p-3 text-slate-600">${c.phone}</td><td class="p-3 text-slate-600">${c.orderCount || 0}</td><td class="p-3 font-bold text-slate-800">R$ ${(c.totalSpent || 0).toFixed(2).replace('.', ',')}</td><td class="p-3 text-slate-600">${new Date(c.createdAt.seconds * 1000).toLocaleDateString('pt-BR')}</td></tr>`).join('')}</tbody></table></div>`; }
function renderAdminOrders(container) { const getStatusClass = (status) => { switch (status) { case 'pago': return 'bg-green-100 text-green-800'; case 'awaiting-confirmation': return 'bg-yellow-100 text-yellow-800'; default: return 'bg-slate-100 text-slate-800'; } }; const formatAddress = (addr) => { if (!addr || !addr.street) return 'N/A'; return `${addr.street}, ${addr.number} - ${addr.neighborhood}, ${addr.city} - ${addr.state}, CEP: ${addr.cep}${addr.complement ? ` (${addr.complement})` : ''}`; }; const formatDate = (timestamp) => { if (!timestamp || !timestamp.seconds) return 'N/A'; return new Date(timestamp.seconds * 1000).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }; container.innerHTML = `<h1 class="text-3xl font-bold text-slate-900 mb-8">Histórico de Pedidos</h1><div class="bg-white rounded-lg shadow overflow-hidden"><table class="w-full text-sm"><thead class="bg-slate-50"><tr><th class="p-3 text-left font-semibold text-slate-600">Data</th><th class="p-3 text-left font-semibold text-slate-600">Cliente</th><th class="p-3 text-left font-semibold text-slate-600">Endereço</th><th class="p-3 text-left font-semibold text-slate-600">Itens</th><th class="p-3 text-left font-semibold text-slate-600">Total</th><th class="p-3 text-left font-semibold text-slate-600">Status</th><th class="p-3 text-left font-semibold text-slate-600">Ações</th></tr></thead><tbody class="divide-y divide-slate-200">${localOrders.length === 0 ? `<tr><td colspan="7" class="p-4 text-center text-slate-500">Nenhum pedido encontrado.</td></tr>` : localOrders.map(o => `<tr><td class="p-3 text-slate-500">${formatDate(o.createdAt)}</td><td class="p-3"><div class="font-medium text-slate-900">${o.customer?.name || 'N/A'}</div><div class="text-slate-500">${o.customer?.phone || ''}</div></td><td class="p-3 text-slate-700 max-w-xs">${formatAddress(o.address)}</td><td class="p-3 text-slate-700">${o.items.map(i => `${i.quantity}x ${i.name}`).join('<br>')}</td><td class="p-3 font-bold text-slate-900">R$ ${o.total.toFixed(2).replace('.', ',')}</td><td class="p-3"><span class="px-2 py-1 text-xs font-medium rounded-full ${getStatusClass(o.status)}">${o.status?.replace('-', ' ') || 'Pendente'}</span></td><td class="p-3">${o.status === 'awaiting-confirmation' ? `<button data-action="confirm-payment" data-id="${o.id}" class="text-sm bg-green-500 text-white px-3 py-1 rounded-md hover:bg-green-600">Confirmar</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`; }
function renderAdminMarketing(container) { container.innerHTML = `<h1 class="text-3xl font-bold text-slate-900 mb-2">Assistente de Marketing IA</h1><p class="text-slate-600 mb-8">Gere conteúdo criativo para suas redes sociais e mensagens com base nos seus produtos.</p><div class="bg-white p-6 rounded-lg shadow"><div class="grid grid-cols-1 md:grid-cols-2 gap-6"><div><label for="product-select" class="block text-sm font-medium text-slate-700 mb-1">1. Escolha o Produto</label><select id="product-select" class="w-full rounded-md border-slate-300 shadow-sm"><option value="">Selecione um produto...</option>${localProducts.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}</select><label for="platform-select" class="block text-sm font-medium text-slate-700 mt-4 mb-1">2. Escolha a Plataforma</label><select id="platform-select" class="w-full rounded-md border-slate-300 shadow-sm"><option value="instagram">Post para Instagram</option><option value="facebook">Post para Facebook</option><option value="whatsapp">Mensagem para WhatsApp</option></select><label for="tone-select" class="block text-sm font-medium text-slate-700 mt-4 mb-1">3. Escolha o Tom</label><select id="tone-select" class="w-full rounded-md border-slate-300 shadow-sm"><option value="amigavel">Amigável e Casual</option><option value="divertido">Divertido e Engraçado</option><option value="sofisticado">Sofisticado e Premium</option><option value="informativo">Informativo e Saudável</option></select><label for="custom-focus" class="block text-sm font-medium text-slate-700 mt-4 mb-1">4. Foco da Campanha (Opcional)</label><input type="text" id="custom-focus" placeholder="Ex: Promoção de Verão, Dia das Mães" class="w-full rounded-md border-slate-300 shadow-sm"><button id="generate-social-post" class="mt-6 w-full bg-indigo-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-indigo-700 transition">Gerar Conteúdo</button></div><div class="bg-slate-50 p-4 rounded-lg"><h3 class="font-semibold text-slate-800 mb-2">Resultado Gerado:</h3><div id="ai-result-container" class="prose prose-sm max-w-none h-64 overflow-y-auto bg-white p-3 rounded-md border border-slate-200 whitespace-pre-wrap"><span class="text-slate-400">O conteúdo gerado pela IA aparecerá aqui...</span></div><button id="copy-ai-result" class="mt-4 w-full bg-slate-200 text-slate-800 font-bold py-2 px-4 rounded-lg hover:bg-slate-300 transition hidden">Copiar Texto</button></div></div></div>`; }

// LÓGICA DE DADOS, ROUTER E EVENT LISTENERS
async function handleProductFormSubmit(e) { e.preventDefault(); const form = e.target; const formData = new FormData(form); const id = formData.get('id'); const isEditing = id !== ''; const saveButton = document.getElementById('save-product-button'); saveButton.disabled = true; saveButton.textContent = 'A guardar...'; const ingredients = []; document.querySelectorAll('.ingredient-item').forEach((item, index) => { const name = form.querySelector(`[name="ingredient_name_${index}"]`).value; const quantity = form.querySelector(`[name="ingredient_quantity_${index}"]`).value; if (name && quantity) ingredients.push({ name, quantity }); }); const nutritionalInfo = await getNutritionalInfo(ingredients); const productData = { name: formData.get('name'), description: formData.get('description'), price: parseFloat(formData.get('price')), imageUrl: formData.get('imageUrl'), ingredients: ingredients, nutritionalInfo: nutritionalInfo }; try { if (isEditing) { await setDoc(doc(db, "products", id), productData); } else { await addDoc(productsCollection, productData); } closeModal(); } catch (error) { console.error("Erro ao guardar produto:", error); alert("Não foi possível guardar o produto."); saveButton.disabled = false; saveButton.textContent = 'Guardar Produto'; } }
let unsubscribeOrders = null, unsubscribeCustomers = null, initialRenderDone = false;
onAuthStateChanged(auth, user => { currentUser = user; if (user) { if (!unsubscribeOrders) { unsubscribeOrders = onSnapshot(ordersCollection, (snapshot) => { localOrders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a, b) => b.createdAt.seconds - a.createdAt.seconds); if (window.location.hash.startsWith('#admin')) { router(); } }); } if (!unsubscribeCustomers) { unsubscribeCustomers = onSnapshot(customersCollection, (snapshot) => { localCustomers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })); if (window.location.hash.startsWith('#admin')) { router(); } }); } } else { if (unsubscribeOrders) { unsubscribeOrders(); unsubscribeOrders = null; } if (unsubscribeCustomers) { unsubscribeCustomers(); unsubscribeCustomers = null; } localOrders = []; localCustomers = []; } if(initialRenderDone) { router(); } });
onSnapshot(productsCollection, (snapshot) => { localProducts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })); if (!initialRenderDone) { router(); initialRenderDone = true; } else { router(); } });
function router() { const hash = window.location.hash; if (hash.startsWith('#admin')) { if (currentUser) { const view = hash.split('/')[1] || 'dashboard'; renderAdminPanel(view); } else { renderLogin(); } } else { renderPublicSite(); } }
document.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (e.target.id === 'login-form') { const email = e.target.email.value; const password = e.target.password.value; const errorEl = document.getElementById('login-error'); try { await signInWithEmailAndPassword(auth, email, password); window.location.hash = '#admin'; } catch (error) { errorEl.textContent = "Email ou palavra-passe inválidos."; errorEl.classList.remove('hidden'); } }
    if (e.target.id === 'product-form') handleProductFormSubmit(e);
    if (e.target.id === 'chat-input-form') { const input = document.getElementById('chat-text-input'); if (input.value.trim()) handleTextInput(input.value.trim()); input.value = ''; }
    if (e.target.id === 'customer-form') { chatState.customer.name = document.getElementById('customer-name').value; chatState.customer.phone = document.getElementById('customer-phone').value; addUserMessage(`Nome: ${chatState.customer.name}`); askForAddress(); }
    if (e.target.id === 'address-form') { const form = e.target; chatState.address.cep = form.elements.cep.value; chatState.address.street = form.elements.street.value; chatState.address.number = form.elements.number.value; chatState.address.complement = form.elements.complement.value; chatState.address.neighborhood = form.elements.neighborhood.value; chatState.address.city = form.elements.city.value; chatState.address.state = form.elements.state.value; addUserMessage(`Endereço: ${form.elements.street.value}, ${form.elements.number.value}`); await showFinalSummary(); }
});
document.addEventListener('click', async (e) => { const button = e.target.closest('button'); if (!button) return; const action = button.dataset.action; const id = button.dataset.id; if (action === 'logout') await signOut(auth); if (action === 'add-product') openModal(); if (action === 'edit-product') openModal(id); if (action === 'delete-product') { if (confirm('Tem a certeza que deseja remover este produto?')) { await deleteDoc(doc(db, "products", id)); } } if (action === 'close-modal') closeModal(); if (action === 'add-ingredient') { const list = document.getElementById('ingredients-list'); const newIndex = list.children.length; const newIngredientEl = document.createElement('div'); newIngredientEl.innerHTML = renderIngredientInput({ name: '', quantity: '' }, newIndex); list.appendChild(newIngredientEl.firstElementChild); } if (action === 'remove-ingredient') e.target.closest('.ingredient-item').remove(); if (action === 'order-now') { toggleChatbot(); if (chatState.currentStep !== 'selecting_products') { startChat(); showMenu(); } } if (action === 'chat-option') { const value = button.dataset.value; if (value === 'start_order') showMenu(); if (value === 'continue_shopping') { addUserMessage('Adicionar mais itens'); addBotMessage('O que mais gostaria?'); showMenu(); } if (value === 'checkout') askForCustomerInfo(); if (value === 'pay') await showPixPayment(); if (value === 'payment-confirmed') { const orderDocRef = doc(db, 'orders', chatState.orderId); await updateDoc(orderDocRef, { status: 'awaiting-confirmation' }); localStorage.setItem('pendingOrderId', chatState.orderId); addBotMessage('Obrigado! Recebemos a sua confirmação. O seu pedido será preparado assim que o pagamento for verificado.'); listenForPaymentConfirmation(chatState.orderId); renderChatInterface([{ label: 'Iniciar Novo Pedido', value: 'restart' }]); } if (value === 'restart') { localStorage.removeItem('pendingOrderId'); startChat(); } } if (action === 'add-to-cart') addToCart(id); if (button.id === 'generate-description-ai') { const form = document.getElementById('product-form'); const productName = form.name.value; const ingredients = []; document.querySelectorAll('.ingredient-item').forEach((item, index) => { const name = form.querySelector(`[name="ingredient_name_${index}"]`).value; if (name) ingredients.push(name); }); if (!productName || ingredients.length === 0) { alert('Por favor, preencha o nome e pelo menos um ingrediente para a IA criar a descrição.'); return; } button.textContent = 'A criar...'; button.disabled = true; const prompt = `Crie uma descrição de produto curta (2-3 frases), apetitosa e convidativa para uma bebida chamada "${productName}". Os ingredientes principais são: ${ingredients.join(', ')}. Foque nos sentimentos de frescor, sabor e bem-estar. Não inclua o preço.`; const aiDescription = await getApiResponse(prompt); if (aiDescription.startsWith('ERRO:')) { form.description.value = ''; alert(aiDescription); } else { form.description.value = aiDescription; } button.textContent = 'Gerar com IA'; button.disabled = false; } if (button.id === 'generate-social-post') { const productId = document.getElementById('product-select').value; const platform = document.getElementById('platform-select').value; const tone = document.getElementById('tone-select').value; const focus = document.getElementById('custom-focus').value; const resultContainer = document.getElementById('ai-result-container'); const copyButton = document.getElementById('copy-ai-result'); if (!productId) { resultContainer.innerHTML = '<span class="text-red-500">Por favor, selecione um produto primeiro.</span>'; return; } button.textContent = 'A gerar...'; button.disabled = true; resultContainer.innerHTML = '<span class="text-slate-400">A IA está a pensar...</span>'; copyButton.classList.add('hidden'); const product = localProducts.find(p => p.id === productId); const prompt = `Você é um especialista em marketing de redes sociais para a marca 'CoolUp Drinks'. Crie um texto para um ${platform} sobre o nosso produto "${product.name}".\n- Descrição do produto: ${product.description}.\n- O tom da comunicação deve ser: ${tone}.\n- ${focus ? `O foco da campanha é: ${focus}.` : ''}\n- O texto deve ser cativante, curto e direto.\n- Se for para Instagram ou Facebook, inclua 3 a 5 hashtags relevantes no final.\n- Se for para WhatsApp, use emojis e uma linguagem mais direta, talvez com uma pergunta para iniciar a conversa.`; const aiResult = await getApiResponse(prompt); if (aiResult.startsWith('ERRO:')) { resultContainer.innerHTML = `<span class="text-red-500">${aiResult}</span>`; } else { resultContainer.textContent = aiResult; copyButton.classList.remove('hidden'); } button.textContent = 'Gerar Conteúdo'; button.disabled = false; } if (button.id === 'copy-ai-result') { const textToCopy = document.getElementById('ai-result-container').textContent; const textArea = document.createElement("textarea"); textArea.value = textToCopy; document.body.appendChild(textArea); textArea.select(); try { document.execCommand('copy'); button.textContent = 'Copiado!'; setTimeout(() => button.textContent = 'Copiar Texto', 2000); } catch (err) { console.error('Falha ao copiar texto: ', err); button.textContent = 'Erro ao copiar'; } document.body.removeChild(textArea); } if (action === 'confirm-payment') { const orderDocRef = doc(db, 'orders', id); await updateDoc(orderDocRef, { status: 'pago' }); } });
window.addEventListener('hashchange', router);

// FUNÇÕES DO MODAL
const modalContainer = document.getElementById('admin-modal'); const modalContent = document.getElementById('modal-content'); function openModal(productId = null) { const isEditing = productId !== null; const product = isEditing ? localProducts.find(p => p.id === productId) : { name: '', description: '', price: '', imageUrl: '', ingredients: [] }; modalContent.innerHTML = `<form id="product-form" class="p-8"><input type="hidden" name="id" value="${isEditing ? product.id : ''}"><div class="flex justify-between items-center mb-6"><h2 class="text-2xl font-bold text-slate-900">${isEditing ? 'Editar Sabor' : 'Adicionar Novo Sabor'}</h2><button type="button" data-action="close-modal" class="text-slate-400 hover:text-slate-600 text-3xl leading-none">&times;</button></div><div class="space-y-4"><div><label for="name" class="block text-sm font-medium text-slate-700">Nome</label><input type="text" name="name" required class="mt-1 block w-full rounded-md border-slate-300 shadow-sm" value="${product.name || ''}"></div><div><div class="flex justify-between items-center"><label for="description" class="block text-sm font-medium text-slate-700">Descrição</label><button type="button" id="generate-description-ai" class="text-xs bg-indigo-100 text-indigo-700 font-semibold px-2 py-1 rounded-md hover:bg-indigo-200">Gerar com IA</button></div><textarea name="description" rows="3" required class="mt-1 block w-full rounded-md border-slate-300 shadow-sm">${product.description || ''}</textarea></div><div class="grid grid-cols-2 gap-4"><div><label for="price">Preço</label><input type="number" name="price" step="0.01" required class="mt-1 block w-full rounded-md border-slate-300 shadow-sm" value="${product.price || ''}"></div><div><label for="imageUrl">URL da Imagem</label><input type="url" name="imageUrl" required class="mt-1 block w-full rounded-md border-slate-300 shadow-sm" value="${product.imageUrl || ''}"></div></div><div><h3 class="text-lg font-medium text-slate-900 mb-2">Ingredientes</h3><div id="ingredients-list" class="space-y-2">${(product.ingredients || []).map(renderIngredientInput).join('')}</div><button type="button" data-action="add-ingredient" class="mt-2 text-sm text-indigo-600 hover:text-indigo-800 font-semibold">+ Adicionar</button></div></div><div class="mt-8 flex justify-end"><button type="submit" id="save-product-button" class="bg-indigo-600 py-2 px-4 rounded-md text-white hover:bg-indigo-700">Guardar Produto</button></div></form>`; modalContainer.classList.remove('hidden'); }
function renderIngredientInput(ingredient, index) { return `<div class="ingredient-item flex items-center gap-2"><input type="text" name="ingredient_name_${index}" placeholder="Nome" required class="flex-grow rounded-md border-slate-300 shadow-sm text-sm" value="${ingredient.name || ''}"><input type="number" name="ingredient_quantity_${index}" placeholder="Qtd (g/ml)" required class="w-24 rounded-md border-slate-300 shadow-sm text-sm" value="${ingredient.quantity || ''}"><button type="button" data-action="remove-ingredient" class="text-red-500 hover:text-red-700 p-1 rounded-full text-xl leading-none">&times;</button></div>`; }
function closeModal() { modalContainer.classList.add('hidden'); modalContent.innerHTML = ''; }

// =================================================================================
// 10. FUNÇÕES DO CHATBOT (COM GESTÃO DE CLIENTES)
// =================================================================================
const chatbotWindow = document.getElementById('chatbot-window'); const chatbotToggleButton = document.getElementById('chatbot-toggle-button'); const chatbotCloseButton = document.getElementById('chatbot-close-button'); const chatbotMessages = document.getElementById('chatbot-messages'); const chatbotInputArea = document.getElementById('chatbot-input-area');
function toggleChatbot() { chatState.isOpen = !chatState.isOpen; chatbotWindow.classList.toggle('hidden'); chatbotToggleButton.classList.toggle('hidden'); if (chatState.isOpen && chatState.currentStep === 'welcome') startChat(); }
function addBotMessage(html) { const el = document.createElement('div'); el.classList.add('flex', 'mb-4'); el.innerHTML = `<div class="w-10 h-10 rounded-full bg-indigo-500 text-white flex items-center justify-center font-bold flex-shrink-0 mr-3">C</div><div class="bg-slate-100 p-3 rounded-lg max-w-xs">${html}</div>`; chatbotMessages.appendChild(el); chatbotMessages.scrollTop = chatbotMessages.scrollHeight; }
function addUserMessage(text) { const el = document.createElement('div'); el.classList.add('flex', 'justify-end', 'mb-4'); el.innerHTML = `<div class="bg-indigo-600 text-white p-3 rounded-lg max-w-xs">${text}</div>`; chatbotMessages.appendChild(el); chatbotMessages.scrollTop = chatbotMessages.scrollHeight; }
function renderChatInterface(options = []) { const opts = options.map(opt => `<button data-action="chat-option" data-value="${opt.value}" class="w-full text-left bg-white border border-slate-300 rounded-lg p-3 mb-2 hover:bg-slate-50 font-semibold text-indigo-700">${opt.label}</button>`).join(''); chatbotInputArea.innerHTML = `<div>${opts}</div><form id="chat-input-form" class="mt-2 flex gap-2"><input type="text" id="chat-text-input" placeholder="Ou digite sua pergunta..." class="flex-grow rounded-md border-slate-300 shadow-sm"><button type="submit" class="bg-indigo-600 text-white font-bold p-2 rounded-lg hover:bg-indigo-700">Enviar</button></form>`; }
async function handleTextInput(question) { addUserMessage(question); const lower = question.toLowerCase(); let answer; if (lower.includes('pagamento')) answer = "Aceitamos PIX."; else if (lower.includes('horário')) answer = "Funcionamos das 10h às 22h."; else if (lower.includes('entrega')) answer = "A taxa de frete é R$ 5,00."; if (answer) { addBotMessage(answer); } else { addBotMessage("A pensar... 🤔"); const aiAnswer = await getAdvancedChatAnswer(question); chatbotMessages.removeChild(chatbotMessages.lastChild); addBotMessage(aiAnswer); } renderChatInterface([{ label: 'Ver Cardápio & Fazer Pedido', value: 'start_order' }]); }

function startChat() { if (unsubscribeFromOrder) { unsubscribeFromOrder(); unsubscribeFromOrder = null; } chatbotMessages.innerHTML = ''; chatState.cart = []; chatState.customer = { name: '', phone: '' }; chatState.address = { cep: '', street: '', number: '', complement: '', neighborhood: '', city: '', state: '' }; chatState.orderId = null; chatState.currentStep = 'welcome'; addBotMessage('Olá! 👋 Como posso ajudar?'); const pendingOrderId = localStorage.getItem('pendingOrderId'); if (pendingOrderId) { addBotMessage('Notei que você tem um pedido aguardando confirmação de pagamento. Assim que for confirmado, avisaremos aqui!'); listenForPaymentConfirmation(pendingOrderId); } renderChatInterface([{ label: 'Ver Cardápio & Fazer Pedido', value: 'start_order' }]); }
function showMenu() { chatState.currentStep = 'selecting_products'; addUserMessage('Ver Cardápio'); const list = localProducts.map(p => `<li class="flex justify-between items-center py-2"><span>${p.name} - R$ ${p.price.toFixed(2).replace('.',',')}</span><button data-action="add-to-cart" data-id="${p.id}" class="text-sm bg-indigo-100 text-indigo-700 px-2 py-1 rounded-md hover:bg-indigo-200">+ Add</button></li>`).join(''); addBotMessage(`<p class="font-semibold mb-2">Nosso cardápio:</p><ul class="list-none divide-y divide-slate-200">${list}</ul>`); updateCartView(); }
function updateCartView() { if (chatState.cart.length > 0) { const subtotal = chatState.cart.reduce((sum, item) => sum + item.price * item.quantity, 0); const summary = chatState.cart.map(item => `${item.quantity}x ${item.name}`).join(', '); addBotMessage(`<p class="font-semibold">Seu carrinho:</p><p>${summary}</p><p class="mt-2 font-bold">Subtotal: R$ ${subtotal.toFixed(2).replace('.',',')}</p>`); renderChatInterface([{ label: 'Adicionar mais itens', value: 'continue_shopping' }, { label: 'Finalizar Pedido', value: 'checkout' }]); } else { renderChatInterface([{ label: 'Ver Cardápio & Fazer Pedido', value: 'start_order' }]); } }
function addToCart(productId) { const product = localProducts.find(p => p.id == productId); const itemInCart = chatState.cart.find(item => item.id == productId); if (itemInCart) itemInCart.quantity++; else chatState.cart.push({ ...product, quantity: 1 }); addUserMessage(`Adicionar 1x ${product.name}`); updateCartView(); }

function askForCustomerInfo() { chatState.currentStep = 'entering_customer_info'; addUserMessage('Finalizar Pedido'); addBotMessage('Ótima escolha! Para quem será a entrega?'); chatbotInputArea.innerHTML = `<form id="customer-form" class="space-y-3"><input type="text" id="customer-name" placeholder="Nome Completo" required class="w-full rounded-md border-slate-300"><input type="tel" id="customer-phone" placeholder="WhatsApp (DDD + Número)" required class="w-full rounded-md border-slate-300"><button type="submit" class="w-full bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg">Continuar</button></form>`; }
async function askForAddress() {
    chatState.currentStep = 'entering_address';
    addBotMessage('Agora, vamos ao endereço de entrega.');
    chatbotInputArea.innerHTML = `<form id="address-form" class="space-y-3">
        <input type="text" id="address-cep" name="cep" placeholder="CEP" required class="w-full rounded-md border-slate-300">
        <div id="address-fields" class="hidden space-y-3">
            <input type="text" name="street" placeholder="Rua" required class="w-full rounded-md border-slate-300 bg-slate-100" readonly>
            <div class="grid grid-cols-2 gap-2">
                <input type="text" name="number" placeholder="Número" required class="w-full rounded-md border-slate-300">
                <input type="text" name="complement" placeholder="Complemento" class="w-full rounded-md border-slate-300">
            </div>
            <input type="text" name="neighborhood" placeholder="Bairro" required class="w-full rounded-md border-slate-300 bg-slate-100" readonly>
            <div class="grid grid-cols-3 gap-2">
                <input type="text" name="city" placeholder="Cidade" required class="col-span-2 w-full rounded-md border-slate-300 bg-slate-100" readonly>
                <input type="text" name="state" placeholder="UF" required class="w-full rounded-md border-slate-300 bg-slate-100" readonly>
            </div>
            <button type="submit" class="w-full bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg">Confirmar Endereço</button>
        </div>
        <p id="cep-error" class="text-red-500 text-sm hidden"></p>
    </form>`;
    const cepInput = document.getElementById('address-cep');
    cepInput.addEventListener('input', handleCepInput);
}
async function handleCepInput(e) {
    const cepInput = e.target;
    const cep = cepInput.value.replace(/\D/g, '');
    const errorEl = document.getElementById('cep-error');
    const fieldsContainer = document.getElementById('address-fields');

    if (cep.length === 8) {
        try {
            const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
            const data = await response.json();
            if (data.erro) {
                throw new Error('CEP não encontrado.');
            }
            document.querySelector('[name="street"]').value = data.logradouro;
            document.querySelector('[name="neighborhood"]').value = data.bairro;
            document.querySelector('[name="city"]').value = data.localidade;
            document.querySelector('[name="state"]').value = data.uf;
            fieldsContainer.classList.remove('hidden');
            errorEl.classList.add('hidden');
        } catch (error) {
            fieldsContainer.classList.add('hidden');
            errorEl.textContent = error.message + " Por favor, tente novamente.";
            errorEl.classList.remove('hidden');
            // CORREÇÃO: Limpa o campo para permitir nova digitação
            setTimeout(() => {
                cepInput.value = '';
                cepInput.focus();
            }, 100);
        }
    }
}
async function showFinalSummary() {
    chatState.currentStep = 'payment';
    const subtotal = chatState.cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const frete = 5.00;
    const total = subtotal + frete;
    const items = chatState.cart.map(item => `<li>${item.quantity}x ${item.name}</li>`).join('');
    
    addBotMessage(`<p class="font-semibold">Perfeito! Revise seu pedido:</p><ul>${items}</ul><p><strong>Cliente:</strong> ${chatState.customer.name}</p><p><strong>Endereço:</strong> ${chatState.address.street}, ${chatState.address.number}</p><p class="font-bold mt-2">Total: R$ ${total.toFixed(2).replace('.',',')}</p>`);
    
    try {
        const customerId = await handleCustomerUpsert(total);
        const orderData = { 
            items: chatState.cart.map(({id, name, price, quantity}) => ({id, name, price, quantity})), 
            customer: { ...chatState.customer, id: customerId },
            address: chatState.address, 
            total: total, 
            createdAt: serverTimestamp(), 
            status: 'pending' 
        };
        const docRef = await addDoc(ordersCollection, orderData);
        chatState.orderId = docRef.id;
        
        const customerDocRef = doc(db, 'customers', customerId);
        await updateDoc(customerDocRef, { orderIds: arrayUnion(chatState.orderId) });

        renderChatInterface([{ label: 'Pagar com PIX', value: 'pay' }]);
    } catch (error) {
        console.error("Erro ao guardar o pedido:", error);
        addBotMessage("Ocorreu um erro ao registar o seu pedido. Por favor, tente novamente.");
        renderChatInterface([{ label: 'Tentar Novamente', value: 'checkout' }]);
    }
}
async function handleCustomerUpsert(orderTotal) {
    const phone = chatState.customer.phone;
    const q = query(customersCollection, where("phone", "==", phone));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
        const newCustomerData = {
            name: chatState.customer.name,
            phone: phone,
            createdAt: serverTimestamp(),
            orderIds: [],
            orderCount: 1,
            totalSpent: orderTotal
        };
        const docRef = await addDoc(customersCollection, newCustomerData);
        return docRef.id;
    } else {
        const customerDoc = querySnapshot.docs[0];
        const customerData = customerDoc.data();
        const batch = writeBatch(db);
        
        const updatedData = {
            orderCount: (customerData.orderCount || 0) + 1,
            totalSpent: (customerData.totalSpent || 0) + orderTotal
        };
        
        batch.update(customerDoc.ref, updatedData);
        await batch.commit();
        return customerDoc.id;
    }
}
async function showPixPayment() { if (!chatState.orderId) { addBotMessage("Ocorreu um erro. Não foi possível identificar o seu pedido para o pagamento."); return; } addUserMessage('Pagar com PIX'); addBotMessage('A gerar o seu QR Code PIX. Aguarde um momento...'); try { const order = localOrders.find(o => o.id === chatState.orderId) || { total: chatState.cart.reduce((s, i) => s + i.price * i.quantity, 0) + 5.00 }; const response = await fetch('/.netlify/functions/generate-pix', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: order.total, txid: chatState.orderId.substring(0, 25) }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Erro no servidor'); const pixPayload = data.payload; await loadScript("https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"); chatbotMessages.removeChild(chatbotMessages.lastChild); const qrCodeHtml = `<p class="font-semibold mb-2">Pague com PIX para confirmar seu pedido!</p><div id="qrcode" class="p-2 bg-white rounded-lg flex justify-center items-center my-2"></div><p class="font-semibold mt-2 text-sm">PIX Copia e Cola:</p><textarea readonly class="w-full bg-slate-200 text-slate-700 text-xs p-2 rounded-md border-none resize-none" rows="3" onclick="this.select()">${pixPayload}</textarea>`; addBotMessage(qrCodeHtml); new QRCode(document.getElementById("qrcode"), { text: pixPayload, width: 160, height: 160, }); chatState.currentStep = 'finished'; renderChatInterface([{ label: 'Já Paguei!', value: 'payment-confirmed' }]); } catch (error) { console.error("Erro ao gerar PIX:", error); chatbotMessages.removeChild(chatbotMessages.lastChild); addBotMessage(`Ocorreu um erro ao tentar gerar o PIX: ${error.message}. Por favor, tente novamente.`); renderChatInterface([{ label: 'Tentar Novamente', value: 'pay' }]); } }

function listenForPaymentConfirmation(orderId) { if (unsubscribeFromOrder) { unsubscribeFromOrder(); } const orderDocRef = doc(db, 'orders', orderId); unsubscribeFromOrder = onSnapshot(orderDocRef, (docSnap) => { if (docSnap.exists()) { const orderData = docSnap.data(); if (orderData.status === 'pago') { addBotMessage('✅ **Pagamento confirmado!** Seu pedido já está sendo preparado. Obrigado!'); localStorage.removeItem('pendingOrderId'); unsubscribeFromOrder(); unsubscribeFromOrder = null; } } }); }

chatbotToggleButton.addEventListener('click', toggleChatbot);
chatbotCloseButton.addEventListener('click', toggleChatbot);

// Inicia a aplicação
router();
