document.addEventListener('DOMContentLoaded', async () => {
    // --- IndexedDB Setup ---
    const DB_NAME = 'FinovaDB';
    const DB_VERSION = 2;
    let db;

    const initDB = () => {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('users')) {
                    db.createObjectStore('users', { keyPath: 'username' });
                }
                if (!db.objectStoreNames.contains('transactions')) {
                    db.createObjectStore('transactions', { keyPath: 'id' });
                }
                // Migration logic for v2: Ensure transactions store exists
            };

            request.onsuccess = (event) => {
                db = event.target.result;
                resolve(db);
            };

            request.onerror = (event) => reject(event.target.error);
        });
    };

    // --- DB Helper Functions ---
    const dbGet = (storeName, key) => {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    };

    const dbGetAll = (storeName) => {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    };

    const dbSave = (storeName, data) => {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.put(data);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    };

    const dbDelete = (storeName, key) => {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(key);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    };

    // --- State Management ---
    const state = {
        users: [],
        currentUser: null,
        transactions: [],
        accounts: [
            // Assets
            { id: 'cash', name: 'Cash', type: 'asset', category: 'balance-sheet' },
            { id: 'bank', name: 'Bank', type: 'asset', category: 'balance-sheet' },
            { id: 'overdraft', name: 'Bank Overdraft', type: 'liability', category: 'balance-sheet', hidden: true },
            { id: 'inventory', name: 'Inventory', type: 'asset', category: 'trading' },
            { id: 'accounts-receivable', name: 'Accounts Receivable', type: 'asset', category: 'balance-sheet' },
            // Liabilities & Capital
            { id: 'capital', name: 'Owner\'s Capital', type: 'liability', category: 'balance-sheet' },
            { id: 'accounts-payable', name: 'Accounts Payable', type: 'liability', category: 'balance-sheet' },
            { id: 'bank-loan', name: 'Bank Loan', type: 'liability', category: 'balance-sheet' },
            { id: 'drawings', name: 'Drawings', type: 'liability', category: 'balance-sheet' },
            // Trading
            { id: 'sales', name: 'Sales', type: 'revenue', category: 'trading' },
            { id: 'sales-return', name: 'Sales Return', type: 'revenue', category: 'trading' },
            { id: 'purchases', name: 'Purchases', type: 'expense', category: 'trading' },
            { id: 'purchase-return', name: 'Purchase Return', type: 'expense', category: 'trading' },
            { id: 'direct-expenses', name: 'Direct Expenses', type: 'expense', category: 'trading' },
            // P&L
            { id: 'indirect-income', name: 'Other Income', type: 'revenue', category: 'pl' },
            { id: 'rent-expense', name: 'Rent Expense', type: 'expense', category: 'pl' },
            { id: 'salary-expense', name: 'Salary Expense', type: 'expense', category: 'pl' },
            { id: 'utility-expense', name: 'Utility Expense', type: 'expense', category: 'pl' },
            { id: 'miscellanous-expense', name: 'Misc Expenses', type: 'expense', category: 'pl' }
        ],
        currentTheme: localStorage.getItem('theme') || 'light' // Theme remains in localStorage for simplicity
    };

    // --- DOM Elements ---
    const loginOverlay = document.getElementById('login-overlay');
    const appContainer = document.getElementById('app-container');
    const loginView = document.getElementById('login-view');
    const registerView = document.getElementById('register-view');
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const regUsernameInput = document.getElementById('reg-username');
    const regPasswordInput = document.getElementById('reg-password');
    const togglePassword = document.getElementById('togglePassword');
    const loginError = document.getElementById('login-error');
    const showRegister = document.getElementById('show-register');
    const showLogin = document.getElementById('show-login');
    const themeToggle = document.getElementById('theme-toggle');
    const sidebarNav = document.querySelectorAll('.nav-item');
    const sections = document.querySelectorAll('.app-section');
    const sectionTitle = document.getElementById('section-title');
    const logoutBtn = document.getElementById('logout-btn');

    // Forms
    const journalForm = document.getElementById('journal-form');
    const debitSelect = document.getElementById('debit-account');
    const creditSelect = document.getElementById('credit-account');
    const journalDate = document.getElementById('journal-date');
    const journalAmount = document.getElementById('journal-amount');
    const journalNarration = document.getElementById('journal-narration');

    // Ledger
    const ledgerSelect = document.getElementById('ledger-select');

    // Charts
    let assetsLiabilitiesChart = null;
    let profitTrendChart = null;

    // --- Initialization ---
    await init();

    async function init() {
        try {
            await initDB();

            // --- One-time Migration from localStorage to IndexedDB ---
            await migrateLegacyData();

            // Ensure default admin exists
            const admin = await dbGet('users', 'admin');
            if (!admin) {
                await dbSave('users', { username: 'admin', password: 'admin123' });
            }

            applyTheme(state.currentTheme);
            populateAccountDropdowns();
            setupEventListeners();
            await checkLoginSession();
            updateAllModules();

            journalDate.valueAsDate = new Date();
        } catch (error) {
            console.error("Critical Initialization Error:", error);
            alert("Finova failed to initialize properly. Data may be unavailable.");
        }
    }

    async function migrateLegacyData() {
        const isMigrated = localStorage.getItem('isMigratedToDB');
        if (isMigrated) return;

        console.log("Starting migration to IndexedDB...");

        // Migrate Users
        const legacyUsers = JSON.parse(localStorage.getItem('users')) || [];
        for (const user of legacyUsers) {
            await dbSave('users', user);
        }

        // Migrate Transactions (Check both global and namespaced)
        const globalTransactions = JSON.parse(localStorage.getItem('transactions')) || [];
        for (const t of globalTransactions) {
            if (!t.id) t.id = Date.now() + Math.random();
            if (!t.owner) t.owner = 'admin'; // Default fallback
            await dbSave('transactions', t);
        }

        // Check for namespaced transactions for all users
        for (const user of legacyUsers) {
            const userTransactions = JSON.parse(localStorage.getItem(`transactions_${user.username}`)) || [];
            for (const t of userTransactions) {
                if (!t.id) t.id = Date.now() + Math.random();
                t.owner = user.username;
                await dbSave('transactions', t);
            }
        }

        localStorage.setItem('isMigratedToDB', 'true');
        console.log("Migration complete.");
    }

    function setupEventListeners() {
        showRegister.addEventListener('click', (e) => {
            e.preventDefault();
            loginView.classList.add('hidden');
            registerView.classList.remove('hidden');
        });

        showLogin.addEventListener('click', (e) => {
            e.preventDefault();
            registerView.classList.add('hidden');
            loginView.classList.remove('hidden');
        });

        loginForm.addEventListener('submit', handleLogin);
        registerForm.addEventListener('submit', handleRegister);

        togglePassword.addEventListener('click', () => {
            const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
            passwordInput.setAttribute('type', type);
            togglePassword.classList.toggle('fa-eye');
            togglePassword.classList.toggle('fa-eye-slash');
        });

        logoutBtn.addEventListener('click', handleLogout);

        themeToggle.addEventListener('change', () => {
            state.currentTheme = themeToggle.checked ? 'dark' : 'light';
            applyTheme(state.currentTheme);
            localStorage.setItem('theme', state.currentTheme);
        });

        sidebarNav.forEach(nav => {
            nav.addEventListener('click', (e) => {
                e.preventDefault();
                const target = nav.getAttribute('data-section');
                showSection(target);
            });
        });

        journalForm.addEventListener('submit', handleJournalSubmit);
        ledgerSelect.addEventListener('change', () => renderLedger(ledgerSelect.value));

        document.querySelectorAll('.export-pdf').forEach(btn => {
            btn.addEventListener('click', () => exportToPDF(btn.getAttribute('data-table')));
        });
        document.querySelectorAll('.export-csv').forEach(btn => {
            btn.addEventListener('click', () => exportToCSV(btn.getAttribute('data-table')));
        });
    }

    async function handleLogin(e) {
        e.preventDefault();
        const user = usernameInput.value;
        const pass = passwordInput.value;

        const foundUser = await dbGet('users', user);

        if (foundUser && foundUser.password === pass) {
            state.currentUser = foundUser;
            localStorage.setItem('activeUser', foundUser.username); // Persistent session

            await loadUserTransactions();

            loginOverlay.classList.add('hidden');
            appContainer.classList.remove('hidden');
            updateUserUI();
            updateAllModules();
        } else {
            loginError.style.display = 'block';
        }
    }

    async function handleRegister(e) {
        e.preventDefault();
        const user = regUsernameInput.value;
        const pass = regPasswordInput.value;

        const existing = await dbGet('users', user);
        if (existing) {
            alert("Username already exists!");
            return;
        }

        await dbSave('users', { username: user, password: pass });

        alert("Registration successful! Please login.");
        registerView.classList.add('hidden');
        loginView.classList.remove('hidden');
        registerForm.reset();
    }

    async function loadUserTransactions() {
        if (!state.currentUser) return;
        const allTransactions = await dbGetAll('transactions');
        state.transactions = allTransactions.filter(t => t.owner === state.currentUser.username);
    }

    function handleLogout() {
        state.currentUser = null;
        state.transactions = [];
        localStorage.removeItem('activeUser');
        loginOverlay.classList.remove('hidden');
        appContainer.classList.add('hidden');
        registerView.classList.add('hidden');
        loginView.classList.remove('hidden');
    }

    async function checkLoginSession() {
        const activeUsername = localStorage.getItem('activeUser');
        if (activeUsername) {
            const user = await dbGet('users', activeUsername);
            if (user) {
                state.currentUser = user;
                await loadUserTransactions();
                loginOverlay.classList.add('hidden');
                appContainer.classList.remove('hidden');
                updateUserUI();
            }
        }
    }

    function updateUserUI() {
        if (state.currentUser) {
            document.getElementById('display-username').textContent = state.currentUser.username;
            document.getElementById('user-avatar').src = `https://ui-avatars.com/api/?name=${state.currentUser.username}&background=random`;
        }
    }

    function applyTheme(theme) {
        document.body.setAttribute('data-theme', theme);
        themeToggle.checked = (theme === 'dark');
    }

    function showSection(id) {
        sections.forEach(s => s.classList.add('hidden'));
        document.getElementById(id).classList.remove('hidden');
        sidebarNav.forEach(n => {
            n.classList.remove('active');
            if (n.getAttribute('data-section') === id) n.classList.add('active');
        });
        const activeNav = Array.from(sidebarNav).find(n => n.getAttribute('data-section') === id);
        sectionTitle.textContent = activeNav ? activeNav.innerText.trim() : 'Dashboard';
        if (id === 'ledger') renderLedger(ledgerSelect.value);
    }

    function populateAccountDropdowns() {
        const options = state.accounts
            .filter(acc => !acc.hidden)
            .map(acc => `<option value="${acc.id}">${acc.name}</option>`)
            .join('');
        debitSelect.innerHTML = options;
        creditSelect.innerHTML = options;
        ledgerSelect.innerHTML = options;
    }

    async function handleJournalSubmit(e) {
        e.preventDefault();
        const editId = document.getElementById('edit-transaction-id').value;
        const debit = debitSelect.value;
        const credit = creditSelect.value;
        const amount = parseFloat(journalAmount.value);
        const date = journalDate.value;
        const narration = journalNarration.value;

        if (debit === credit) {
            alert("Debit and Credit accounts cannot be the same!");
            return;
        }

        const transaction = {
            id: editId ? parseFloat(editId) : Date.now(),
            owner: state.currentUser.username,
            date,
            debit,
            credit,
            amount,
            narration
        };

        await dbSave('transactions', transaction);

        if (editId) {
            const index = state.transactions.findIndex(t => t.id === parseFloat(editId));
            if (index !== -1) state.transactions[index] = transaction;
            document.getElementById('edit-transaction-id').value = '';
            journalForm.querySelector('button[type="submit"]').textContent = 'Add Entry';
        } else {
            state.transactions.push(transaction);
        }

        journalForm.reset();
        journalDate.valueAsDate = new Date();
        updateAllModules();
        alert(editId ? "Transaction updated successfully!" : "Transaction added successfully!");
    }

    function updateAllModules() {
        updateDashboard();
        renderJournal();
        renderTrialBalance();
        renderTradingPL();
        renderBalanceSheet();
    }

    // --- Module Rendering (Synchronous on in-memory state) ---
    function updateDashboard() {
        const balances = calculateBalances();
        const totalAssets = state.accounts.filter(a => a.type === 'asset').reduce((sum, a) => sum + (balances[a.id] || 0), 0);
        const totalLiabilities = state.accounts.filter(a => a.type === 'liability' && a.id !== 'capital').reduce((sum, a) => sum + (balances[a.id] || 0), 0);
        const netProfit = calculateNetProfit(balances);

        document.getElementById('total-assets').textContent = totalAssets.toFixed(2);
        document.getElementById('total-liabilities').textContent = totalLiabilities.toFixed(2);
        document.getElementById('net-profit-loss').textContent = netProfit.toFixed(2);
        document.getElementById('net-profit-loss').className = netProfit >= 0 ? 'profit' : 'loss';

        updateCharts(totalAssets, totalLiabilities, netProfit);
        renderRecentTransactions();
    }

    function renderRecentTransactions() {
        const tbody = document.querySelector('#recent-transactions-table tbody');
        const recent = [...state.transactions].reverse().slice(0, 5);
        tbody.innerHTML = recent.map(t => `
            <tr>
                <td>${t.date}</td>
                <td>${t.narration}</td>
                <td>${t.amount.toFixed(2)}</td>
                <td><span class="debit-highlight">${getAccountName(t.debit)}</span> / <span class="credit-highlight">${getAccountName(t.credit)}</span></td>
            </tr>
        `).join('');
    }

    function renderJournal() {
        const tbody = document.querySelector('#journal-table tbody');
        tbody.innerHTML = [...state.transactions].reverse().map(t => `
            <tr>
                <td>${t.date}</td>
                <td>
                    <div class="debit-highlight">${getAccountName(t.debit)} A/c Dr</div>
                    <div class="credit-highlight" style="padding-left: 20px">To ${getAccountName(t.credit)} A/c</div>
                </td>
                <td class="text-right debit-highlight">${t.amount.toFixed(2)}</td>
                <td class="text-right credit-highlight">${t.amount.toFixed(2)}</td>
                <td><small>${t.narration}</small></td>
                <td>
                    <div class="action-btns">
                        <button class="btn btn-action btn-edit" onclick="editTransaction(${t.id})" title="Edit">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-action btn-delete" onclick="deleteTransaction(${t.id})" title="Delete">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    }

    window.editTransaction = (id) => {
        const t = state.transactions.find(tx => tx.id === id);
        if (!t) return;

        document.getElementById('edit-transaction-id').value = t.id;
        journalDate.value = t.date;
        debitSelect.value = t.debit;
        creditSelect.value = t.credit;
        journalAmount.value = t.amount;
        journalNarration.value = t.narration;

        journalForm.querySelector('button[type="submit"]').textContent = 'Update Entry';
        journalForm.scrollIntoView({ behavior: 'smooth' });
    };

    window.deleteTransaction = async (id) => {
        if (!confirm("Are you sure you want to delete this transaction?")) return;

        await dbDelete('transactions', id);
        state.transactions = state.transactions.filter(t => t.id !== id);
        updateAllModules();
    };

    function renderLedger(accountId) {
        const tbody = document.querySelector('#ledger-table tbody');
        let runningBalance = 0;
        const entries = [];
        state.transactions.forEach(t => {
            if (t.debit === accountId) {
                runningBalance += t.amount;
                entries.push({ date: t.date, particular: `To ${getAccountName(t.credit)}`, debit: t.amount, credit: 0, balance: runningBalance });
            } else if (t.credit === accountId) {
                runningBalance -= t.amount;
                entries.push({ date: t.date, particular: `By ${getAccountName(t.debit)}`, debit: 0, credit: t.amount, balance: runningBalance });
            }
        });
        tbody.innerHTML = entries.map(e => `
            <tr>
                <td>${e.date}</td>
                <td>${e.particular}</td>
                <td class="text-right">${e.debit ? e.debit.toFixed(2) : '-'}</td>
                <td class="text-right">${e.credit ? e.credit.toFixed(2) : '-'}</td>
                <td class="text-right font-bold">${e.balance.toFixed(2)}</td>
            </tr>
        `).join('');
    }

    function renderTrialBalance() {
        const balances = calculateBalances();
        const tbody = document.querySelector('#trial-balance-table tbody');
        let totalDebit = 0, totalCredit = 0;
        const rows = state.accounts.map(acc => {
            const bal = balances[acc.id] || 0;
            if (bal === 0) return '';
            const isDebit = bal > 0;
            if (isDebit) totalDebit += Math.abs(bal); else totalCredit += Math.abs(bal);
            return `<tr><td>${acc.name}</td><td class="text-right">${isDebit ? Math.abs(bal).toFixed(2) : '-'}</td><td class="text-right">${!isDebit ? Math.abs(bal).toFixed(2) : '-'}</td></tr>`;
        }).join('');
        tbody.innerHTML = rows;
        document.getElementById('tb-total-debit').textContent = totalDebit.toFixed(2);
        document.getElementById('tb-total-credit').textContent = totalCredit.toFixed(2);
        const status = document.getElementById('tb-status');
        if (Math.abs(totalDebit - totalCredit) < 0.01) {
            status.textContent = "Trial Balance is Balanced!";
            status.className = "alert alert-success mt-4";
        } else {
            status.textContent = `Trial Balance is not Balanced! Difference: ${Math.abs(totalDebit - totalCredit).toFixed(2)}`;
            status.className = "alert alert-danger mt-4";
        }
    }

    function renderTradingPL() {
        const balances = calculateBalances();
        const tradingTbody = document.querySelector('#trading-table tbody');
        const tradingAccounts = state.accounts.filter(a => a.category === 'trading');
        let gpDebit = 0, gpCredit = 0;
        const tradingRows = tradingAccounts.map(acc => {
            const bal = balances[acc.id] || 0;
            if (bal === 0) return '';
            const isDebit = bal > 0;
            if (isDebit) gpDebit += Math.abs(bal); else gpCredit += Math.abs(bal);
            return `<tr><td>${acc.name}</td><td class="text-right">${isDebit ? Math.abs(bal).toFixed(2) : '-'}</td><td class="text-right">${!isDebit ? Math.abs(bal).toFixed(2) : '-'}</td></tr>`;
        });
        const grossProfit = gpCredit - gpDebit;
        if (grossProfit >= 0) {
            tradingRows.push(`<tr class="profit"><td>To Gross Profit c/d</td><td class="text-right">${grossProfit.toFixed(2)}</td><td class="text-right">-</td></tr>`);
            gpDebit += grossProfit;
        } else {
            tradingRows.push(`<tr class="loss"><td>By Gross Loss c/d</td><td class="text-right">-</td><td class="text-right">${Math.abs(grossProfit).toFixed(2)}</td></tr>`);
            gpCredit += Math.abs(grossProfit);
        }
        tradingTbody.innerHTML = tradingRows.join('');
        document.getElementById('trading-total-debit').textContent = gpDebit.toFixed(2);
        document.getElementById('trading-total-credit').textContent = gpCredit.toFixed(2);

        const plTbody = document.querySelector('#pl-table tbody');
        const plAccounts = state.accounts.filter(a => a.category === 'pl');
        let netDebit = 0, netCredit = 0;
        const plRows = [];
        if (grossProfit >= 0) { plRows.push(`<tr><td>By Gross Profit b/d</td><td class="text-right">-</td><td class="text-right">${grossProfit.toFixed(2)}</td></tr>`); netCredit += grossProfit; }
        else { plRows.push(`<tr><td>To Gross Loss b/d</td><td class="text-right">${Math.abs(grossProfit).toFixed(2)}</td><td class="text-right">-</td></tr>`); netDebit += Math.abs(grossProfit); }
        plAccounts.forEach(acc => {
            const bal = balances[acc.id] || 0;
            if (bal === 0) return;
            const isDebit = bal > 0;
            if (isDebit) netDebit += Math.abs(bal); else netCredit += Math.abs(bal);
            plRows.push(`<tr><td>${acc.name}</td><td class="text-right">${isDebit ? Math.abs(bal).toFixed(2) : '-'}</td><td class="text-right">${!isDebit ? Math.abs(bal).toFixed(2) : '-'}</td></tr>`);
        });
        const netProfit = netCredit - netDebit;
        if (netProfit >= 0) { plRows.push(`<tr class="profit"><td>To Net Profit</td><td class="text-right">${netProfit.toFixed(2)}</td><td class="text-right">-</td></tr>`); netDebit += netProfit; }
        else { plRows.push(`<tr class="loss"><td>By Net Loss</td><td class="text-right">-</td><td class="text-right">${Math.abs(netProfit).toFixed(2)}</td></tr>`); netCredit += Math.abs(netProfit); }
        plTbody.innerHTML = plRows.join('');
        document.getElementById('pl-total-debit').textContent = netDebit.toFixed(2);
        document.getElementById('pl-total-credit').textContent = netCredit.toFixed(2);
    }

    function renderBalanceSheet() {
        const balances = calculateBalances();
        const netProfit = calculateNetProfit(balances);
        const bsTbody = document.getElementById('bs-body');

        // Handle Bank/Overdraft Reclassification
        const bankBal = balances['bank'] || 0;
        let finalAssets = state.accounts.filter(a => a.type === 'asset');
        let finalLiabilities = state.accounts.filter(l => l.type === 'liability' && l.id !== 'drawings');

        if (bankBal < 0) {
            // Reclassify to Overdraft
            finalAssets = finalAssets.filter(a => a.id !== 'bank');
            // Duplicate check to avoid adding multiple 'Overdraft' rows if already present (though unlikely)
            if (!finalLiabilities.find(l => l.id === 'overdraft')) {
                finalLiabilities.push({ id: 'overdraft', name: 'Bank Overdraft' });
            }
            // Assign negative bank balance as positive liability
            balances['overdraft'] = Math.abs(bankBal);
        } else {
            // Keep as Bank Asset
            finalLiabilities = finalLiabilities.filter(l => l.id !== 'overdraft');
        }

        const drawingsBal = balances['drawings'] || 0;
        let totalAssets = 0, totalLiabsCap = 0;

        const maxRows = Math.max(finalAssets.length, finalLiabilities.length);
        let rows = '';
        for (let i = 0; i < maxRows; i++) {
            const asset = finalAssets[i];
            const liab = finalLiabilities[i];
            let assetName = '', assetAmt = '', liabName = '', liabAmt = '';

            if (asset) {
                const bal = balances[asset.id] || 0;
                assetName = asset.name;
                assetAmt = bal.toFixed(2);
                totalAssets += bal;
            }

            if (liab) {
                const bal = Math.abs(balances[liab.id] || 0);
                liabName = liab.name;
                liabAmt = bal.toFixed(2);
                totalLiabsCap += bal;

                if (liab.id === 'capital') {
                    const finalCap = bal + netProfit - drawingsBal;
                    liabName = `Capital (+NP, -Drawings)`;
                    liabAmt = finalCap.toFixed(2);
                    totalLiabsCap = (totalLiabsCap - bal) + finalCap;
                }
            }
            rows += `<tr><td>${assetName}</td><td class="text-right">${assetAmt}</td><td>${liabName}</td><td class="text-right">${liabAmt}</td></tr>`;
        }
        bsTbody.innerHTML = rows;
        document.getElementById('bs-total-assets').textContent = totalAssets.toFixed(2);
        document.getElementById('bs-total-liabilities').textContent = totalLiabsCap.toFixed(2);
        const status = document.getElementById('bs-status');

        const isBalanced = Math.abs(totalAssets - totalLiabsCap) < 0.01;
        if (isBalanced) {
            status.textContent = "Balance Sheet is Balanced!";
            status.className = "alert alert-success mt-4";
        } else {
            status.textContent = "Balance Sheet is out of Balance!";
            status.className = "alert alert-danger mt-4";
        }

        // --- Financial Position Analysis ---
        const fpBox = document.getElementById('financial-position-box');
        const fpLabel = document.getElementById('fp-status-label');
        const fpIndicator = fpLabel.parentElement;
        const fpDesc = document.getElementById('fp-description');
        const fpCheck = document.getElementById('fp-accounting-check');

        // Rule: Assets vs Pure Liabilities (Excluding Capital)
        const pureLiabilitiesAmt = finalLiabilities
            .filter(l => l.id !== 'capital')
            .reduce((sum, l) => sum + Math.abs(balances[l.id] || 0), 0);

        fpBox.classList.remove('hidden');

        const diff = totalAssets - pureLiabilitiesAmt;
        fpIndicator.className = 'fp-status-indicator'; // Reset

        if (Math.abs(diff) < 0.01) {
            fpLabel.textContent = "BALANCED";
            fpIndicator.classList.add('fp-status-balanced');
            fpDesc.textContent = "Business just breaks even. No financial strength or weakness.";
        } else if (diff > 0) {
            fpLabel.textContent = "POSITIVE";
            fpIndicator.classList.add('fp-status-positive');
            fpDesc.textContent = `Assets exceed liabilities by ${diff.toFixed(2)}. Business is financially healthy.`;
        } else {
            fpLabel.textContent = "NEGATIVE";
            fpIndicator.classList.add('fp-status-negative');
            fpDesc.textContent = `Liabilities exceed assets by ${Math.abs(diff).toFixed(2)}. Weak financial condition.`;
        }

        fpCheck.textContent = isBalanced ?
            "Accounting Check: Assets = Liabilities + Capital (Verified)" :
            "Accounting Check: Error! Assets do not match Liabilities + Capital";
        fpCheck.style.color = isBalanced ? "var(--success)" : "var(--danger)";
    }

    // --- Helpers ---
    function calculateBalances() {
        const balances = {};
        state.transactions.forEach(t => {
            balances[t.debit] = (balances[t.debit] || 0) + t.amount;
            balances[t.credit] = (balances[t.credit] || 0) - t.amount;
        });
        return balances;
    }

    function calculateNetProfit(balances) {
        let profit = 0;
        state.accounts.forEach(acc => {
            const bal = balances[acc.id] || 0;
            if (acc.category === 'trading' || acc.category === 'pl') profit -= bal;
        });
        return profit;
    }

    function getAccountName(id) { const acc = state.accounts.find(a => a.id === id); return acc ? acc.name : id; }

    function updateCharts(assets, liabs, profit) {
        const ctxAL = document.getElementById('assetsLiabilitiesChart').getContext('2d');
        const ctxTrend = document.getElementById('profitTrendChart').getContext('2d');
        if (assetsLiabilitiesChart) assetsLiabilitiesChart.destroy();
        if (profitTrendChart) profitTrendChart.destroy();

        const isDark = state.currentTheme === 'dark';
        const textColor = isDark ? '#94a3b8' : '#64748b';

        // 1. Assets vs Liabilities Doughnut
        assetsLiabilitiesChart = new Chart(ctxAL, {
            type: 'doughnut',
            data: {
                labels: ['Assets', 'Liabilities'],
                datasets: [{
                    data: [assets, liabs],
                    backgroundColor: ['#3b82f6', '#f97316'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { labels: { color: textColor } } }
            }
        });

        // 2. Cumulative Profit Trend
        const profitSteps = [];
        let currentBalances = {};

        state.transactions.forEach(t => {
            currentBalances[t.debit] = (currentBalances[t.debit] || 0) + t.amount;
            currentBalances[t.credit] = (currentBalances[t.credit] || 0) - t.amount;
            profitSteps.push(calculateNetProfit(currentBalances));
        });

        // Show last 15 points for better trend visualization
        const trendData = profitSteps.slice(-15);
        const labels = state.transactions.slice(-15).map((t, i) => t.date);

        profitTrendChart = new Chart(ctxTrend, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Net Profit Trend',
                    data: trendData,
                    borderColor: '#10b981',
                    tension: 0.4,
                    fill: true,
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    pointRadius: 4,
                    pointHoverRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        ticks: { color: textColor },
                        grid: { color: isDark ? '#334155' : '#e2e8f0' }
                    },
                    x: {
                        ticks: { color: textColor },
                        grid: { display: false }
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (context) => `Profit: ₹${context.raw.toFixed(2)}`
                        }
                    }
                }
            }
        });
    }

    function exportToPDF(tableId) { const { jsPDF } = window.jspdf; const doc = new jsPDF(); doc.text(sectionTitle.textContent, 14, 15); doc.autoTable({ html: `#${tableId}`, startY: 20 }); doc.save(`${tableId}.pdf`); }
    function exportToCSV(tableId) {
        const table = document.getElementById(tableId);
        let csv = [];
        for (let i = 0; i < table.rows.length; i++) {
            let row = [], cols = table.rows[i].cells;
            for (let j = 0; j < cols.length; j++) row.push(cols[j].innerText.trim());
            csv.push(row.join(","));
        }
        const csvContent = "data:text/csv;charset=utf-8," + csv.join("\n");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `${tableId}.csv`);
        document.body.appendChild(link);
        link.click();
    }
});
