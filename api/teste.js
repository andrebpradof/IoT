var mqtt = require('mqtt')
var client = mqtt.connect('http://localhost:1883')

client.on('connect', function() {
    client.subscribe('2/aircon/24', function(err) {
        if (!err) {
            client.publish('2/temp/20', '{"s":"20/12/2020 12:12:40","0":21,"temp":23}')
            //client.publish('2/temp/20', '{"s":"14/11/2020 23:47:00","0":22,"temp":21}');
            //client.publish('2/umid/21', '{"s":"14/11/2020 23:49:00","0":22,"umid":67}');
            //client.publish('2/luz/26', '{"s":"14/11/2020 23:51:00","21":1,"0":26}');
            //client.publish('2/movimento/25', '{"s":"14/11/2020 23:55:00","0":25}');


            //client.publish('2/response', '{"s":"14/11/2020 23:10:00","0":24,"21":1,"4":19,"3":10,"1":22,"2":18,"22":1,"23":12345}');

            
            client.end();
        }
    })
})

client.on('message', function(topic, message) {
    // message is Buffer
    console.log(topic);
    console.log(message.toString());
       
})