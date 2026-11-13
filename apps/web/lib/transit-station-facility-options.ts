/**
 * 站内设施类型词表。
 * 站内设施编辑器与线路工作台共用同一份选项，避免两处维护不同的类型清单。
 */
export const TRANSIT_STATION_FACILITY_OPTIONS = [
  ['elevator', '电梯'],
  ['escalator', '扶梯'],
  ['escalator_and_stairs', '扶梯/楼梯'],
  ['stairs', '楼梯'],
  ['stairs_two_way', '双向楼梯'],
  ['wheelchair_lift', '轮椅升降机'],
  ['toilet', '卫生间'],
  ['mens_restroom', '男卫生间'],
  ['womens_restroom', '女卫生间'],
  ['family_restroom', '家庭卫生间'],
  ['accessible_restroom', '无障碍卫生间'],
  ['third_restroom', '第三卫生间'],
  ['passenger_service_center', '乘客服务中心'],
  ['ticket_machine', '自动售票机'],
  ['nursing_room', '母婴室'],
  ['police', '警务室'],
  ['waiting_room', '候车室'],
  ['meeting_point', '会合点'],
  ['wheelchair', '无障碍设施'],
  ['platform_door', '屏蔽门'],
  ['subway', '地铁'],
] as const;
