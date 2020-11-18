var mqtt = require('mqtt') // Faz o requerimento do modulo MQTT
const admin = require('firebase-admin') // Faz requerimento do modulo da base de dados Firebase

var client = mqtt.connect('http://localhost:1885')  //Cria a conexão com o broker MQTT

let serviceAccount = require('../iot-2020-firebase.json');  //Adiciona o arquivo de configuração do Firebase
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

let db = admin.firestore(); //Cria a conexão com o Cloud Firestore do Firebase

// Valores padrões para o ar condicionado
var ar = { 
    id: 24,
    temp_atual:17,
    temp_max:18,
    temp_min:16,
    on_off:false,
    status_sala:true,
    registro:0,
}

// Seta os valores para o ar condicionado
set_ar('2/ar/24');

// Identificação dos dispositivos
const dispositivos = [
    {name: 'ar', id: 24},
    {name: 'sensores', id: 20},
    {name: 'sensores', id: 21},
    {name: 'sensores', id: 22},
    {name: 'sensores', id: 25},
    {name: 'sensores', id: 26},
];

const time = 2;
const sala = 2;

// Identificação dos sensores
const sensor = {
    'temp': [20, 21, 22],
    'umid': [20, 21, 22],
    'luz': [26],
    'movimento': [25]
};
var topicos = [];
topicos.push(time+'/response');   // Adicionar um tópico na variável

// Adicionar os tópicos dos sensores na variável
for (var prop in sensor) {
    for (var i in sensor[prop]) {
        topicos.push(sala + '/' + prop + '/' + sensor[prop][i])
    }
}

// Conexão do cliente com o broker. O cliente se inscreve nos tópicos. Além disso, temos a verificação de possíveis erros.
client.on('connect', function() {
    client.subscribe(topicos, function(err) {
        if (!err) {
            console.log('Micro-serviço inscrito nos topicos');
        }
    })
})

// Cliente recebe as mensagens inscritas no broker 
client.on('message', function(topic, message) {

    var obj = JSON.parse(message.toString());
    var topico = topic.split("/");
    var result = dispositivos.find( disp => disp.id === obj['0'] );

    if(result != null){ // Leituras 
        if(result.name == 'ar'){            
            var status_ar,status_sala;
            if(obj['21'] === 1){status_ar = true} else{status_ar = false}
            if(obj['22'] === 1){status_sala = true} else{status_sala = false}

            var data = { 
                'id': obj['0'],
                'temp_atual': obj['4'],
                'temp_min': obj['2'],
                'temp_max': obj['1'], 
                'on_off': status_ar,
                'status_sala': status_sala,
                'registro': obj['23'],
                'data': convert_data(obj['s'])
            };

            ar.id = obj['0'];
            ar.temp_atual = obj['4'];
            ar.temp_min = obj['2'];
            ar.temp_max = obj['2'];
            ar.on_off = status_ar;
            ar.status_sala = status_sala;
            ar.registro = obj['23'];

            atualiza_registro_bd(obj,result.name,data);
            insere_registro_bd(obj,result.name,data);
        }
        else if(result.name == 'sensores'){

            switch (topico[1]) {
                case 'temp':
                    console.log("Sensor: Temp - Valor: "+obj['temp']);
                    var data = {
                        'id': obj['0'],
                        'tipo': 'temperatura',
                        'valor': obj['temp'],
                        'data':  convert_data(obj['s'])
                    };
                    atualiza_registro_bd(obj,result.name,data);
                    insere_registro_bd(obj,result.name,data);

                    if((obj['temp'] < ar.temp_min || obj['temp'] > ar.temp_max) && ar.on_off == false){
                        //liga o ar
                        client.publish(time+'/aircon/'+ar.id,'{"0":1,"21":1,"23":'+ar.registro+'}');
                        console.log("Liga o ar");

                        ar.on_off = true;
                        atualiza_ar(ar);
                    }
                    else if( (obj['temp'] >= ar.temp_min && obj['temp'] <= ar.temp_max) && ar.on_off == true ){
                        //desliga o ar
                        client.publish(time+'/aircon/'+ar.id,'{"0":1,"21":0,"23":'+ar.registro+'}');
                        console.log("Desliga o ar");

                        ar.on_off = false;
                        atualiza_ar(ar);
                    }
                    else{
                        console.log("Caiu em nada");
                    }
                    break;
                case 'umid':
                    console.log("Sensor: Umid - Valor: "+obj['umid']);
                    var data = {
                        'id': obj['0'],
                        'tipo': 'umidade',
                        'valor': obj['umid'],
                        'data':  convert_data(obj['s'])
                    };
                    atualiza_registro_bd(obj,result.name,data);
                    insere_registro_bd(obj,result.name,data);
                    break;
                case 'luz':
                   
                    var status_luz;
                    if(obj['21'] === 1){status_luz = true} else{status_luz = false}
                    console.log("Sensor: Luz - Valor: "+status_luz);
                    var data = {
                        'id': obj['0'],
                        'tipo': 'luminosidade',
                        'valor': status_luz,
                        'data':  convert_data(obj['s'])
                    };
                    atualiza_registro_bd(obj,result.name,data);
                    insere_registro_bd(obj,result.name,data);

                    if(status_luz == false && ar.on_off == true && ar.status_sala == false){
                        //desliga o ar
                        client.publish(time+'/aircon/'+ar.id,'{"0":1,"21":0,"23":'+ar.registro+'}');
                        console.log("Desliga o ar - apagou a luz");
                        ar.on_off = false;
                        atualiza_ar(ar);
                    }
                    else if(status_luz == true && ar.on_off == false){
                        //liga o ar
                        client.publish(time+'/aircon/'+ar.id,'{"0":1,"21":1,"23":'+ar.registro+'}');
                        console.log("Liga o ar - acendeu a luz");
                        ar.on_off = true;
                        atualiza_ar(ar);
                    }

                    break;
                case 'movimento':
                    console.log("Sensor: Movimento");
                    var data = {
                        'id': obj['0'],
                        'tipo': 'movimento',
                        'data':  convert_data(obj['s'])
                    };
                    atualiza_registro_bd(obj,result.name,data);
                    insere_registro_bd(obj,result.name,data);    
                    break;
            }
                
        }
        else{
            console.log("Erro! Não foi encontrado nenhum dispositivo com esse ID");
        }
    }
    else{
        console.log("Erro! Não foi encontrado nenhum dispositivo com esse ID");
    }
})

// Converte a data vinda do broker para o padrão do Firebase
function convert_data(dateString){

    var dateTimeParts = dateString.split(' '),
    timeParts = dateTimeParts[1].split(':'),
    dateParts = dateTimeParts[0].split('/'),
    date;

    date = new Date(dateParts[2], parseInt(dateParts[1], 10) - 1, dateParts[0], timeParts[0], timeParts[1],timeParts[2]);
    return admin.firestore.Timestamp.fromDate(date);
}

// Tranforma a data em seu valor em segundos
function convert_data_to_time(dateString){

    var dateTimeParts = dateString.split(' '),
    timeParts = dateTimeParts[1].split(':'),
    dateParts = dateTimeParts[0].split('/'),
    date;

    date = new Date(dateParts[2], parseInt(dateParts[1], 10) - 1, dateParts[0], timeParts[0], timeParts[1],timeParts[2]);
    return date.getTime();
}

// Pega a data atuel e retorna em forma de string
function string_data(){
    var data = new Date();

    // Guarda cada pedaço em uma variável
    var dia     = data.getDate();           // 1-31
    var dia_sem = data.getDay();            // 0-6 (zero=domingo)
    var mes     = data.getMonth();          // 0-11 (zero=janeiro)
    var ano2    = data.getYear();           // 2 dígitos
    var ano4    = data.getFullYear();       // 4 dígitos
    var hora    = data.getHours();          // 0-23
    var min     = data.getMinutes();        // 0-59
    var seg     = data.getSeconds();        // 0-59
    var mseg    = data.getMilliseconds();   // 0-999
    var tz      = data.getTimezoneOffset(); // em minutos

    // Formata a data e a hora (note o mês + 1)
    return dia+'/'+(mes+1)+'/'+ano4+' '+hora+':'+min+':'+seg;
}

// Atualiza o registro na base de dados
function atualiza_registro_bd(obj,tipo,data){
    let doc_sensor = db.collection('Salas').doc(sala+'/'+tipo+'/'+obj['0']);
    let set = doc_sensor.set(data);
}

// Insere a leitura na base de dados
function insere_registro_bd(obj,tipo,data){
    let doc_registro = db.collection('Salas').doc(sala+'/'+tipo+'/'+obj['0']+'/registros/'+convert_data_to_time(obj['s']));
    let set = doc_registro.set(data);
}

// Atualiza o registro do ar condicionado na base de dados
function atualiza_ar(ar){
    var data = { 
        'id': ar.id,
        'temp_atual': ar.temp_atual,
        'temp_min': ar.temp_min,
        'temp_max': ar.temp_max, 
        'on_off': ar.on_off,
        'status_sala': ar.status_sala,
        'registro': ar.registro,
        'data': convert_data(string_data())
    };
    var id_ar = {'0': 24, 's': string_data()};

    atualiza_registro_bd(id_ar,'ar',data);
    insere_registro_bd(id_ar,'ar',data);
}

// Realiza a busca dos dados da última atualização do ar no banco 
function set_ar(query){
    let ref = db.collection('Salas').doc(query); // Realiza a query
    ref.get() // Pega os resultados
    .then(doc => {
        if (!doc.exists) {
            console.log('Registros não encontrados! Carregando valores padrões');
        } else {
            ar = { // Seta os valores recebidos
                id: doc.data().id,
                temp_atual:doc.data().temp_atual,
                temp_max:doc.data().temp_max,
                temp_min:doc.data().temp_min,
                on_off:doc.data().on_off,
                status_sala:doc.data().status_sala,
                registro:doc.data().registro,
            } 
        }
    })
    .catch(err => {
        console.log('Erro ao buscar documento', err);
    });
}