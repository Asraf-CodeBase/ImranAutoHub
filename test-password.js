const bcrypt = require('bcryptjs');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const commonPasswords = [
    'password', 'Password123', '123456', '12345678', 'qwerty',
    'abc123', 'password123', 'admin', 'Admin123', 'letmein',
    'welcome', 'monkey', '1234567890', 'Password1', 'Pass123',
    'test123', 'Test123', 'user123', 'User123', 'demo123',
    'password1', 'Password@123', 'Admin@123', 'Test@123', 'Ashraf123'
];

function showMenu() {
    console.clear();
    console.log('╔════════════════════════════════════════╗');
    console.log('║   Password Tool 🔐                    ║');
    console.log('╠════════════════════════════════════════╣');
    console.log('║  1. Verify a password                 ║');
    console.log('║  2. Try common passwords              ║');
    console.log('║  3. Hash a password                   ║');
    console.log('║  4. Exit                              ║');
    console.log('╚════════════════════════════════════════╝\n');
}

async function verifyPassword(hash, password) {
    return await bcrypt.compare(password, hash);
}

async function tryCommonPasswords(hash) {
    console.log('\n🔍 Trying common passwords...\n');
    
    for (let i = 0; i < commonPasswords.length; i++) {
        const password = commonPasswords[i];
        process.stdout.write(`\rTrying: ${password.padEnd(25)} [${i + 1}/${commonPasswords.length}]`);
        
        const isMatch = await verifyPassword(hash, password);
        
        if (isMatch) {
            console.log('\n\n✅ PASSWORD FOUND!');
            console.log(`╔═══════════════════════════════╗`);
            console.log(`║  Password: ${password.padEnd(18)}║`);
            console.log(`╚═══════════════════════════════╝\n`);
            return password;
        }
        
        await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    console.log('\n\n❌ Password not found in common passwords\n');
    return null;
}

async function hashPassword(password) {
    return await bcrypt.hash(password, 10);
}

async function option1() {
    rl.question('\nEnter hashed password: ', async (hash) => {
        rl.question('Enter password to verify: ', async (password) => {
            const isMatch = await verifyPassword(hash, password);
            
            if (isMatch) {
                console.log('\n✅ Password MATCHES!\n');
            } else {
                console.log('\n❌ Password does NOT match\n');
            }
            
            rl.question('Press Enter to continue...', () => {
                main();
            });
        });
    });
}

async function option2() {
    rl.question('\nEnter hashed password: ', async (hash) => {
        await tryCommonPasswords(hash);
        
        rl.question('Press Enter to continue...', () => {
            main();
        });
    });
}

async function option3() {
    rl.question('\nEnter password to hash: ', async (password) => {
        const hash = await hashPassword(password);
        console.log('\n✅ Hashed password:');
        console.log(hash);
        console.log('');
        
        rl.question('Press Enter to continue...', () => {
            main();
        });
    });
}

function main() {
    showMenu();
    
    rl.question('Choose an option (1-4): ', async (choice) => {
        switch(choice) {
            case '1':
                await option1();
                break;
            case '2':
                await option2();
                break;
            case '3':
                await option3();
                break;
            case '4':
                console.log('\nGoodbye! 👋\n');
                rl.close();
                break;
            default:
                console.log('\nInvalid option!\n');
                setTimeout(main, 1000);
        }
    });
}

main();