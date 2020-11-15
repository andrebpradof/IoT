var mqtt = require('mqtt')
const {v4:uuid} = require('uuid');
const admin = require('firebase-admin')

var client = mqtt.connect('http://localhost:1883')

let serviceAccount = require('../iot-ssc0952-2020-ebd8e8d5c70d.json');
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

let db = admin.firestore();

// let docRef = db.collection('users').doc('alovelace');

// let setAda = docRef.set({
//     first: 'Ada',
//     last: 'Lovelace',
//     born: 1815
// });
var ar = {
    id: 24,
    temp_atual:17,
    temp_max:18,
    temp_min:16,
    on_off:false,
    status_sala:true,
    registro:0,
}
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

const sensor = {
    'temp': [20, 21, 22],
    'umid': [20, 21, 22],
    'luz': [26],
    'movimento': [25]
};
const topicos = [];
topicos.push(time + '/response');

for (var prop in sensor) {
    for (var i in sensor[prop]) {
        topicos.push(sala + '/' + prop + '/' + sensor[prop][i])
    }
}

client.on('connect', function() {
    client.subscribe(topicos, function(err) {
        if (!err) {
            console.log('Micro-serviço inscrito nos topicos');
        }
    })
})

client.on('message', function(topic, message) {

    var obj = JSON.parse(message.toString());
    var topico = topic.split("/");
    var result = dispositivos.find( disp => disp.id === obj['0'] );

    if(result != null){
        if(result.name == 'ar'){
            
            var status_ar,status_sala;
            if(obj['21'] === 1){status_ar = true} else{status_ar = false}
            if(obj['22'] === 1){status_sala = true} else{status_sala = false}

            var data = { 
                'id': obj['0'],
                'temp_atual': obj['4'],
                'temp_min': obj['2'],
                'temp_max': obj['1'], 
                'on/off': status_ar,
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

            atualiza_sensor(obj,result.name,data);
            add_registro_sensor(obj,result.name,data);

               // db.collection('Salas').doc('2/ar/24').get()
            // .then((snapshot) => {
            //     snapshot.forEach((doc) => {
            //     console.log(doc.id, '=>', doc.data());
            //     });
            // })
            // .catch((err) => {
            //     console.log('Error getting documents', err);
            // });

            // let cityRef = db.collection('Salas').doc('2/ar/24');
            // let getDoc = cityRef.get()
            // .then(doc => {
            //     if (!doc.exists) {
            //     console.log('No such document!');
            //     } else {
            //         var time = doc.data().data;
            //         var date = time.toDate();
            //         date.setTime(date.getTime() + date.getTimezoneOffset() * 60 * 1000 /* convert to UTC */ + (/* UTC+8 */ -4) * 60 * 60 * 1000);
            //         console.log(date);
            //     }
            // })
            // .catch(err => {
            //     console.log('Error getting document', err);
            // });
        }
        else if(result.name == 'sensores'){
            
            switch (topico[1]) {
                case 'temp':
                    var data = {
                        'id': obj['0'],
                        'tipo': 'temperatura',
                        'valor': obj['temp'],
                        'data':  convert_data(obj['s'])
                    };
                    atualiza_sensor(obj,result.name,data);
                    add_registro_sensor(obj,result.name,data);


                     if((obj['temp'] < ar.temp_min || obj['temp'] > ar.temp_max) && ar.on_off == false){
                         //liga o ar
                         client.publish(time+'/aircon/'+ar.id,'{"0":1,"21":1,"23":'+ar.registro+'}');
                     }
                    else if((obj['temp'] > ar.temp_min && obj['temp'] < ar.temp_max) && ar.on_off == true){
                         //desliga o ar
                         client.publish(time+'/aircon/'+ar.id,'{"0":1,"21":0,"23":'+ar.registro+'}');
                    }


                    break;
                case 'umid':
                    var data = {
                        'id': obj['0'],
                        'tipo': 'umidade',
                        'valor': obj['umid'],
                        'data':  convert_data(obj['s'])
                    };
                    atualiza_sensor(obj,result.name,data);
                    add_registro_sensor(obj,result.name,data);
                    break;
                case 'luz':
                    var status_luz;
                    if(obj['21'] === 1){status_luz = true} else{status_luz = false}
                    var data = {
                        'id': obj['0'],
                        'tipo': 'luminosidade',
                        'valor': status_luz,
                        'data':  convert_data(obj['s'])
                    };
                    atualiza_sensor(obj,result.name,data);
                    add_registro_sensor(obj,result.name,data);

                    if(status_luz == false && ar.on_off == true && ar.status_sala == true){
                        //desliga o ar
                        client.publish(time+'/aircon/'+ar.id,'{"0":1,"21":0,"23":'+ar.registro+'}');
                    }
                    else if(status_luz == true && ar.on_off == false && ar.status_sala == true){
                        //liga o ar
                        client.publish(time+'/aircon/'+ar.id,'{"0":1,"21":1,"23":'+ar.registro+'}');
                    }

                    break;
                case 'movimento':
                    var data = {
                        'id': obj['0'],
                        'tipo': 'movimento',
                        'data':  convert_data(obj['s'])
                    };
                    atualiza_sensor(obj,result.name,data);
                    add_registro_sensor(obj,result.name,data);    
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

function convert_data(dateString){

    var dateTimeParts = dateString.split(' '),
    timeParts = dateTimeParts[1].split(':'),
    dateParts = dateTimeParts[0].split('/'),
    date;

    date = new Date(dateParts[2], parseInt(dateParts[1], 10) - 1, dateParts[0], timeParts[0], timeParts[1],timeParts[2]);
    return admin.firestore.Timestamp.fromDate(date);
}

function convert_data_to_time(dateString){

    var dateTimeParts = dateString.split(' '),
    timeParts = dateTimeParts[1].split(':'),
    dateParts = dateTimeParts[0].split('/'),
    date;

    date = new Date(dateParts[2], parseInt(dateParts[1], 10) - 1, dateParts[0], timeParts[0], timeParts[1],timeParts[2]);
    return date.getTime();
}
function atualiza_sensor(obj,tipo,data){
    let doc_sensor = db.collection('Salas').doc(sala+'/'+tipo+'/'+obj['0']);
    let set = doc_sensor.set(data);
}
function add_registro_sensor(obj,tipo,data){
    let doc_registro = db.collection('Salas').doc(sala+'/'+tipo+'/'+obj['0']+'/registros/'+convert_data_to_time(obj['s']));
    let set = doc_registro.set(data);
}