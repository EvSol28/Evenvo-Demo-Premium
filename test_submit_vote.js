const https = require('https');

function testSubmitVote() {
    return new Promise((resolve) => {
        console.log('🧪 Test de l\'endpoint submit_vote...');
        
        const postData = JSON.stringify({
            formId: 'test_form_id',
            userId: 'test_user_id',
            responses: {
                'question1': 'Option 1',
                'question2': 'Option 2'
            }
        });

        const options = {
            hostname: 'evenvo-demo-premium.onrender.com',
            port: 443,
            path: '/api/event/Event_1/submit_vote',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                console.log(`📊 Status: ${res.statusCode}`);
                
                try {
                    const jsonData = JSON.parse(data);
                    console.log(`✅ Response JSON:`, JSON.stringify(jsonData, null, 2));
                } catch (e) {
                    console.log(`📄 Raw Response (not JSON):`, data.substring(0, 200));
                }
                
                resolve();
            });
        });

        req.on('error', (error) => {
            console.log(`❌ Error: ${error.message}`);
            resolve();
        });

        req.setTimeout(10000, () => {
            console.log(`⏰ Timeout`);
            req.destroy();
            resolve();
        });

        req.write(postData);
        req.end();
    });
}

async function runTest() {
    console.log('🚀 Test de l\'endpoint de soumission de vote...\n');
    await testSubmitVote();
    console.log('\n✅ Test terminé');
}

runTest().catch(console.error);