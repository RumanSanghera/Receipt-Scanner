import React, { Component, Fragment } from "react";
import { View, Text, FlatList, TouchableOpacity ,StyleSheet,Alert,Modal,Pressable } from "react-native";
import Style from "./Style";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SERVER_IP } from "../serverConnect"

//sort by total 
//categorise by month (change start and end date of month)
//total amount spent this month
// add search ( filter what to search by)
//total each month
// categroise i.e food ,shopping,books,clothing etc

class History extends Component {
  constructor(props) {
    super(props);

    this.state = {
      id : "",
      errorTxt: "",
      data: "",
      modalVisible: false,
      sortBy: "Date Of Upload - Descending",
    };
  }
  async componentDidMount() {
    this.unsubscribe = this.props.navigation.addListener("focus", () => {
    
    this.loadHistory();
    
   

  });
  }
async componentWillUnmount() {
  this.unsubscribe();
}
totalAscending = async() => 
{
  const data = [...this.state.data].sort((a, b) => a.total - b.total);
  this.setState({sortBy: "Total - Low To High"});
  this.setState({data: data});
}
totalDescending = async() => 
{
  const data = [...this.state.data].sort((a, b) => a.total - b.total);
  this.setState({sortBy: "Total - High To Low"});
  this.setState({data: data});
}
dateUploadAscending = async() => 
{
  const data = [...this.state.data].sort((a, b) => a.dateofupload > b.dateofupload ? 1 : -1,);
  this.setState({sortBy: "Date Of Upload - Ascending"});
  this.setState({data: data});

}
dateUploadDescending = async() => 
{
  const data = [...this.state.data].sort((a, b) => a.dateofupload > b.dateofupload ? -1 : 1,);
  this.setState({sortBy: "Date Of Upload - Descending"});
  this.setState({data: data});
}

loadHistory = async () => {
  const id = await AsyncStorage.getItem("@id");

  this.setState({id: id});

  if (id == null) {
    this.props.navigation.navigate("Login");
  }

  
  fetch(SERVER_IP+"getAllReceipts?id="+id)
  .then(async(response) => {
  
    if (response.status == 200) {
       response.json().then(async(json) => {

        this.setState({data: json});
       
       
       })
      

     
    } else if (response.status == 403) {
      return this.setState({ errorTxt: "Email doesnt Exist" });
      //used display the resposnes from the server
    } else if (response.status == 403) {
      return this.setState({ errorTxt: "Invalid Password" });
      //each error code returns a diffrent response to the user
    } else {
      return this.setState({ errorTxt: "Something went wrong" });
    }
  })
  .catch((error) => {
    console.error(error);
  });
  
};
renderDate = async (date) => {

  console.log(date);
  return(
    <View>
    <Text>hell{date}</Text>
    </View>
  )

}

render() {
  return (
    <View style={Style.container}>


      <Text style={Style.title}>History</Text>

      <Modal
        animationType="slide"
        transparent={true}
        visible={this.state.modalVisible}
        onRequestClose={() => {
          Alert.alert("Modal has been closed.");
          this.setState({modalVisible: !this.state.modalVisible});
        }}
      >
        <View style={Style.centeredView}>
          <View style={Style.modalView}>
            <Text style={Style.modalText}>Select Sort By</Text>

            <Pressable
              style={[Style.button]}
              onPress={() => {this.totalDescending(); this.setState({modalVisible: !this.state.modalVisible})}}
            >
              <Text style={Style.textStyle}>Total - High to Low</Text>
            </Pressable>

            <Pressable
              style={[Style.button]}
              onPress={() =>  {this.totalAscending(); this.setState({modalVisible: !this.state.modalVisible})}}
            >
              <Text style={Style.textStyle}>Total - Low to High</Text>
            </Pressable>

            <Pressable
              style={[Style.button]}
              onPress={() => {this.dateUploadDescending(); this.setState({modalVisible: !this.state.modalVisible})}}
            >
              <Text style={Style.textStyle}>Date Of Upload - Descending</Text>
            </Pressable>

            <Pressable
              style={[Style.button]}
              onPress={() => {this.dateUploadAscending(); this.setState({modalVisible: !this.state.modalVisible})}}
            >
              <Text style={Style.textStyle}>Date Of Upload - Ascending</Text>
            </Pressable>

         
          </View>
        </View>
      </Modal>
      <Pressable
        style={[Style.button]}
        onPress={() => this.setState({modalVisible: true})}
      >
        <Text style={Style.textStyle}>Sort By </Text>
      </Pressable>
      <Text > {this.state.sortBy} </Text>
      <FlatList
          data={this.state.data}
          keyExtractor={(item) => item.recipt_id}
          renderItem={({ item ,index}) => {
            
            //
          //this.renderDate(item.dateofupload)
            
        //this.state.data[index].dateofupload
            return (
              <Fragment>
              <Text>{this.state.data[index].dateofupload}</Text>
              <TouchableOpacity
              style={Style.button}
              onPress={() => this.props.navigation.navigate("MoreHistory",{rec_id: item.recipt_id})}>
                <Text  style={Style.text} >{item.title} </Text>
                <Text  style={Style.text}> {item.dateofupload} </Text>
                <Text  style={Style.text}>{item.total} </Text>
              </TouchableOpacity>
              </Fragment>
            )
 
          }}
          
        />
      
    </View>
  );
}
}

export default History