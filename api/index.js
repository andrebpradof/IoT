var mqtt = require('mqtt') // Faz o requerimento do modulo MQTT
let db = require('./db'); // Configurações do banco
const util = require('./util'); // Funções uteis

var client = mqtt.connect('http://localhost:1883')  //Cria a conexão com o broker MQTT


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
util.set_ar('2/ar/24');

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

    var obj = JSON.parse(message.toString()); // Transforma a mensagem recebida em um objeto JSON
    var topico = topic.split("/");
    var result = dispositivos.find( disp => disp.id === obj['0'] ); // Procura qual dispositivo ó o da mensagem

    if(result != null){ // Se for um dispositivo conhecido 
        if(result.name == 'ar'){    // Se for o ar condicionado  
            var status_ar,status_sala;
            if(obj['21'] === 1){status_ar = true} else{status_ar = false} // Verifica se o ar está ligado
            if(obj['22'] === 1){status_sala = true} else{status_sala = false} // verifica se ele deve ficar ligado
                                                                              // quando a sala está vazia
            var data = {    // Estrutura para salvar no banco
                'id': obj['0'],
                'temp_atual': obj['4'],
                'temp_min': obj['2'],
                'temp_max': obj['1'], 
                'on_off': status_ar,
                'status_sala': status_sala,
                'registro': obj['23'],
                'data':  util.convert_data(obj['s'])
            };

            // Faz uma cópia dos atributos para deixar em RAM e assim evitar buscas no banco
            ar.id = obj['0'];
            ar.temp_atual = obj['4'];
            ar.temp_min = obj['2'];
            ar.temp_max = obj['2'];
            ar.on_off = status_ar;
            ar.status_sala = status_sala;
            ar.registro = obj['23'];
            
            // Insere no banco
            util.atualiza_registro_bd(obj,result.name,data);
            util.insere_registro_bd(obj,result.name,data);
        }
        else if(result.name == 'sensores'){ // Se for um sensor

            switch (topico[1]) {
                case 'temp': // Sensor de temperatura
                    console.log("Sensor: Temp - Valor: "+obj['temp']);
                    var data = { // Estrutura para salvar no banco
                        'id': obj['0'],
                        'tipo': 'temperatura',
                        'valor': obj['temp'],
                        'data':   util.convert_data(obj['s'])
                    };
                    // Salva no banco
                    util.atualiza_registro_bd(obj,result.name,data);
                    util.insere_registro_bd(obj,result.name,data);
                    
                    // Verifica se a temperatura está fora do intervalo desejado e se o ar está desligado
                    // Considerou-se que o ar tbm esquenta a sala
                    if((obj['temp'] < ar.temp_min || obj['temp'] > ar.temp_max) && ar.on_off == false){
                        //Se estiver fora, liga o ar
                        client.publish(time+'/aircon/'+ar.id,'{"0":1,"21":1,"23":'+ar.registro+'}');
                        console.log("Liga o ar");

                        ar.on_off = true;
                        util.atualiza_ar(ar);

                    }// Verifica se a temperatura está dentro do intervalo desejado e se o ar está ligado
                    else if( (obj['temp'] >= ar.temp_min && obj['temp'] <= ar.temp_max) && ar.on_off == true ){
                        //Se estiver dentro, desliga o ar
                        client.publish(time+'/aircon/'+ar.id,'{"0":1,"21":0,"23":'+ar.registro+'}');
                        console.log("Desliga o ar");

                        ar.on_off = false;
                        util.atualiza_ar(ar);
                    }
                    else{
                        console.log("Caiu em nada");
                    }
                    break;
                case 'umid': // Sensor de Umidade
                    console.log("Sensor: Umid - Valor: "+obj['umid']);
                    var data = { // Estrutura para salvar no banco
                        'id': obj['0'],
                        'tipo': 'umidade',
                        'valor': obj['umid'],
                        'data':   util.convert_data(obj['s'])
                    };
                    util.atualiza_registro_bd(obj,result.name,data);
                    util.insere_registro_bd(obj,result.name,data);
                    break;
                case 'luz': // Sensor de 
                   
                    var status_luz;
                    if(obj['21'] === 1){status_luz = true} else{status_luz = false}
                    console.log("Sensor: Luz - Valor: "+status_luz);
                    var data = {
                        'id': obj['0'],
                        'tipo': 'luminosidade',
                        'valor': status_luz,
                        'data': util.convert_data(obj['s'])
                    };
                    util.atualiza_registro_bd(obj,result.name,data);
                    util.insere_registro_bd(obj,result.name,data);

                    if(status_luz == false && ar.on_off == true && ar.status_sala == false){
                        //desliga o ar
                        client.publish(time+'/aircon/'+ar.id,'{"0":1,"21":0,"23":'+ar.registro+'}');
                        console.log("Desliga o ar - apagou a luz");
                        ar.on_off = false;
                        util.atualiza_ar(ar);
                    }
                    else if(status_luz == true && ar.on_off == false){
                        //liga o ar
                        client.publish(time+'/aircon/'+ar.id,'{"0":1,"21":1,"23":'+ar.registro+'}');
                        console.log("Liga o ar - acendeu a luz");
                        ar.on_off = true;
                        util.atualiza_ar(ar);
                    }

                    break;
                case 'movimento':
                    console.log("Sensor: Movimento");
                    var data = {
                        'id': obj['0'],
                        'tipo': 'movimento',
                        'data':   util.convert_data(obj['s'])
                    };
                    util.atualiza_registro_bd(obj,result.name,data);
                    util.insere_registro_bd(obj,result.name,data);    
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